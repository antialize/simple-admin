use std::borrow::Cow;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::io::Write;
use std::ops::Deref;
use std::sync::Arc;

use crate::action_types::{
    DeploymentObjectAction, DeploymentObjectStatus, DeploymentStatus, IAddDeploymentLog,
    IClearDeploymentLog, IDeploymentObject, IDeploymentTrigger, IObject2, IServerAction,
    ISetDeploymentMessage, ISetDeploymentObjectStatus, ISetDeploymentObjects, ISetDeploymentStatus,
    ISource, IToggleDeploymentObject, ObjectRow,
};
use crate::arena::Arena;
use crate::cmpref::CmpRef;
use crate::hostclient::HostClient;
use crate::ocell::{OCell, OCellAccess};
use crate::ordered_json::JsonCmp;
use crate::state::State;
use crate::variabels::Variables;
use crate::webclient;
use anyhow::{anyhow, bail, Context, Result};
use base64::prelude::BASE64_STANDARD;
use base64::Engine;
use log::error;
use sadmin2::client_message::{
    ClientHostMessage, HostClientMessage, RunScriptMessage, RunScriptOutType, RunScriptStdinType,
};
use sadmin2::type_types::{
    IBoolTypeProp, IChoiceTypeProp, IContainsIter, IDependsIter, IDocumentTypeProp,
    INumberTypeProp, IPasswordTypeProp, ITextTypeProp, ITriggersIter, IType, ITypeProp,
    IVariablesIter, KindType, COLLECTION_ID, COMPLEX_COLLECTION_ID, HOST_ID, HOST_VARIABLE_ID,
    PACKAGE_ID, ROOT_INSTANCE_ID, TYPE_ID,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx_type::{query, query_as};

type ValueMap = serde_json::Map<String, Value>;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IDeployContent {
    #[serde(default)]
    script: Option<String>,
    content: Option<ValueMap>,
    triggers: Vec<IDeploymentTrigger>,
    deployment_order: i64,
    type_name: String,
    object: i64,
}

fn num_len(n: i64) -> usize {
    match n {
        0..10 => 1,
        10..100 => 2,
        100..1000 => 3,
        1000..10000 => 4,
        10000..100000 => 5,
        100000..1000000 => 6,
        1000000..10000000 => 7,
        10000000..100000000 => 8,
        100000000..1000000000 => 9,
        1000000000..10000000000 => 10,
        10000000000..100000000000 => 11,
        100000000000..1000000000000 => 12,
        1000000000000..10000000000000 => 13,
        10000000000000..100000000000000 => 14,
        100000000000000..1000000000000000 => 15,
        1000000000000000..10000000000000000 => 16,
        10000000000000000..100000000000000000 => 17,
        100000000000000000..1000000000000000000 => 18,
        1000000000000000000..=9223372036854775807 => 19,
        -9..0 => 2,
        -99..=-10 => 3,
        -999..=-100 => 4,
        -9999..=-1000 => 5,
        -99999..=-10000 => 6,
        -999999..=-100000 => 7,
        -9999999..=-1000000 => 8,
        -99999999..=-10000000 => 9,
        -999999999..=-100000000 => 10,
        -9999999999..=-1000000000 => 11,
        -99999999999..=-10000000000 => 12,
        -999999999999..=-100000000000 => 13,
        -9999999999999..=-1000000000000 => 14,
        -99999999999999..=-10000000000000 => 15,
        -999999999999999..=-100000000000000 => 16,
        -9999999999999999..=-1000000000000000 => 17,
        -99999999999999999..=-10000000000000000 => 18,
        -999999999999999999..=-100000000000000000 => 19,
        -9223372036854775808..=-1000000000000000000 => 20,
    }
}

pub struct Deployment {
    pub status: DeploymentStatus,
    pub message: String,
    pub deployment_objects: Vec<IDeploymentObject>,
    pub log: Vec<String>,
    delayed_actions: Vec<IServerAction>,
}

impl Deployment {
    fn add_header(&mut self, name: &str, big: bool) {
        let s = if big {
            format!("\r\n\x1b[91m{:=^1$}\x1b[0m\r\n", name, 100)
        } else {
            format!("\r\n\x1b[91m{:-^1$}\x1b[0m\r\n", name, 100)
        };
        self.add_log(s)
    }

    fn add_log(&mut self, line: String) {
        self.log.push(line.clone());
        self.delayed_actions
            .push(IServerAction::AddDeploymentLog(IAddDeploymentLog {
                bytes: line,
            }));
    }

    fn set_status(&mut self, status: DeploymentStatus) {
        self.status = status.clone();
        self.delayed_actions
            .push(IServerAction::SetDeploymentStatus(ISetDeploymentStatus {
                status,
            }));
    }

    fn set_object_status(&mut self, index: usize, status: DeploymentObjectStatus) {
        if let Some(v) = self.deployment_objects.get_mut(index) {
            v.status = status.clone();
        }
        self.delayed_actions
            .push(IServerAction::SetDeploymentObjectStatus(
                ISetDeploymentObjectStatus { index, status },
            ));
    }
    fn set_message(&mut self, message: String) {
        self.message = message.clone();
        self.delayed_actions
            .push(IServerAction::SetDeploymentMessage(ISetDeploymentMessage {
                message,
            }))
    }

    fn set_deploment_objects(&mut self, objects: Vec<IDeploymentObject>) {
        self.deployment_objects = objects.clone();
        self.delayed_actions
            .push(IServerAction::SetDeploymentObjects(ISetDeploymentObjects {
                objects,
            }));
    }

    fn clear_log(&mut self) {
        self.log.clear();
        self.delayed_actions
            .push(IServerAction::ClearDeploymentLog(IClearDeploymentLog {}));
    }

    fn take_actions(&mut self) -> Vec<IServerAction> {
        std::mem::take(&mut self.delayed_actions)
    }
}

impl Default for Deployment {
    fn default() -> Self {
        Self {
            status: DeploymentStatus::Done,
            message: Default::default(),
            deployment_objects: Default::default(),
            log: Default::default(),
            delayed_actions: Default::default(),
        }
    }
}

async fn mut_deployment<T>(
    state: &State,
    f: impl FnOnce(&mut Deployment) -> Result<T>,
) -> Result<T> {
    let (actions, res) = {
        let mut deployment = state.deployment.lock().unwrap();
        let res = f(&mut deployment)?;
        (deployment.take_actions(), res)
    };
    for action in actions {
        webclient::broadcast(state, action)?;
    }
    Ok(res)
}

type Node<'a, M> = OCell<M, DagNode<'a, M>>;

struct DagNodeBase<'a, M> {
    prev: Vec<&'a Node<'a, M>>,
    next: Vec<&'a Node<'a, M>>,
    in_count: usize,
    type_order: i64,
    id: i64,
}

enum DagNode<'a, M> {
    Sentinal {
        base: DagNodeBase<'a, M>,
        name: &'a str,
    },
    Normal {
        base: DagNodeBase<'a, M>,
        name: &'a str,
        triggers: Vec<IDeploymentTrigger>,
        deployment_title: &'a str,
        script: Option<&'a str>,
        content: serde_json::Map<String, serde_json::Value>,
        type_id: i64,
    },
}

impl<M> std::fmt::Debug for DagNode<'_, M> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sentinal { base, name } => f
                .debug_struct("Sentinal")
                .field("base", &base.id)
                .field("name", name)
                .finish(),
            Self::Normal {
                base,
                name,
                triggers,
                deployment_title,
                script,
                content,
                type_id,
            } => f
                .debug_struct("Normal")
                .field("base", &base.id)
                .field("name", name)
                .field("triggers", triggers)
                .field("deployment_title", deployment_title)
                .field("script", script)
                .field("content", content)
                .field("type_id", type_id)
                .finish(),
        }
    }
}

impl<'a, M> DagNode<'a, M> {
    fn base_mut(&mut self) -> &mut DagNodeBase<'a, M> {
        match self {
            DagNode::Sentinal { base, .. } => base,
            DagNode::Normal { base, .. } => base,
        }
    }
    fn base(&self) -> &DagNodeBase<'a, M> {
        match self {
            DagNode::Sentinal { base, .. } => base,
            DagNode::Normal { base, .. } => base,
        }
    }
}

struct Object {
    r#type: i64,
    content: ValueMap,
    name: String,
}

type NodePair<'a, M> = (&'a Node<'a, M>, &'a Node<'a, M>);

struct Visitor<'a, M> {
    objects: &'a HashMap<i64, Object>,
    types: &'a HashMap<i64, IType>,
    errors: Vec<String>,
    tops: HashMap<i64, Option<NodePair<'a, M>>>,
    top_visiting: HashSet<i64>,
    node_arena: &'a Arena<Node<'a, M>, M>,
    string_arena: &'a Arena<u8, M>,
    nodes: HashMap<&'a str, NodePair<'a, M>>,
    host_id: i64,
    outer_vars: Variables<'a>,
}

struct VisitContentResult<'a> {
    content: ValueMap,
    deployment_title: &'a str,
    script: Option<String>,
}

impl<'a, M> Visitor<'a, M> {
    fn template(
        &mut self,
        vars: &mut Variables<'a>,
        name: &str,
        v: &'a str,
        deployment_title: &str,
    ) -> Cow<'a, str> {
        match crate::mustache::render(v, Some(&self.outer_vars), vars.deref(), true) {
            Ok(v) => v,
            Err(e) => {
                self.errors.push(format!(
                    "Template error in {} of {}: {:?}",
                    name, deployment_title, e
                ));
                error!(
                    "Template error in {} of {}: {:?}",
                    name, deployment_title, e
                );
                "".into()
            }
        }
    }

    fn add_variabels(&mut self, vars: &mut Variables<'a>, obj: &'a Object) {
        for (key, value) in obj.content.variables_iter() {
            let v = self.template(vars, key, value, &obj.name);
            if let Err(e) = vars.add_str(key, v) {
                self.errors.push(format!(
                    "Falid to add variable {} to {}: {:?}",
                    key, obj.name, e
                ));
            }
        }
        for (key, value) in obj.content.secrets_iter() {
            let v = self.template(vars, key, value, &obj.name);
            if let Err(e) = vars.add_str(key, v) {
                self.errors.push(format!(
                    "Falid to add variable {} to {}: {:?}",
                    key, obj.name, e
                ));
            }
        }
    }

    fn visit_content(
        &mut self,
        access: &mut OCellAccess<M>,
        mut deployment_title: &'a str,
        obj_content: &'a ValueMap,
        r#type: &'a IType,
        vars: &mut Variables<'a>,
    ) -> Result<VisitContentResult<'a>> {
        let mut content = ValueMap::new();
        if let Some(type_content) = &r#type.content {
            for item in type_content {
                match item {
                    ITypeProp::None => (),
                    ITypeProp::Monitor => bail!("Monitor is deprecated"),
                    ITypeProp::Bool(IBoolTypeProp {
                        name,
                        default,
                        variable,
                        ..
                    }) => {
                        let v = obj_content
                            .get(name)
                            .and_then(|v| v.as_bool())
                            .unwrap_or(*default);
                        if let Some(variable) = variable {
                            if !variable.is_empty() {
                                vars.add_bool(variable, v)?;
                            }
                        }
                        content.insert(name.to_string(), Value::Bool(v));
                    }
                    ITypeProp::Text(ITextTypeProp {
                        name,
                        default,
                        template,
                        variable,
                        deploy_title,
                        ..
                    }) => {
                        let v = obj_content
                            .get(name)
                            .and_then(|v| v.as_str())
                            .unwrap_or(default);
                        let v = if *template {
                            self.template(vars, name, v, deployment_title)
                        } else {
                            v.into()
                        };
                        let vv = match &v {
                            Cow::Borrowed(v) => v,
                            Cow::Owned(v) => self.string_arena.alloc_str(access, v),
                        };
                        if let Some(variable) = variable {
                            if !variable.is_empty() {
                                vars.add_str(variable, vv)?;
                            }
                        }
                        if deploy_title.unwrap_or_default() {
                            deployment_title = vv;
                        }
                        content.insert(name.to_string(), Value::String(v.into_owned()));
                    }
                    ITypeProp::Password(IPasswordTypeProp { name, .. }) => {
                        let v = obj_content
                            .get(name)
                            .and_then(|v| v.as_str())
                            .unwrap_or_default();
                        content.insert(name.to_string(), Value::String(v.to_string()));
                    }
                    ITypeProp::Document(IDocumentTypeProp {
                        name,
                        template,
                        variable,
                        ..
                    }) => {
                        let v = obj_content
                            .get(name)
                            .and_then(|v| v.as_str())
                            .unwrap_or_default();
                        let v = if *template {
                            self.template(vars, name, v, deployment_title)
                        } else {
                            v.into()
                        };
                        if let Some(variable) = variable {
                            if !variable.is_empty() {
                                vars.add_str(variable, v.clone())?;
                            }
                        }
                        content.insert(name.to_string(), Value::String(v.into_owned()));
                    }
                    ITypeProp::Choice(IChoiceTypeProp {
                        name,
                        default,
                        variable,
                        ..
                    }) => {
                        let v = obj_content
                            .get(name)
                            .and_then(|v| v.as_str())
                            .unwrap_or(default);
                        if let Some(variable) = variable {
                            if !variable.is_empty() {
                                vars.add_str(variable, v)?;
                            }
                        }
                        content.insert(name.to_string(), Value::String(v.to_owned()));
                    }
                    ITypeProp::TypeContent(_) => (),
                    ITypeProp::Number(INumberTypeProp { name, default, .. }) => {
                        let v = obj_content
                            .get(name)
                            .and_then(|v| v.as_number())
                            .cloned()
                            .unwrap_or_else(|| (*default).into());
                        content.insert(name.to_string(), Value::Number(v));
                    }
                }
            }
        }
        let script = r#type.script.as_deref().map(|v| {
            self.template(vars, "script", v, deployment_title)
                .into_owned()
        });
        Ok(VisitContentResult {
            content,
            deployment_title,
            script,
        })
    }

    fn visit_trigger(
        &mut self,
        access: &mut OCellAccess<M>,
        id: i64,
        values: &'a serde_json::Map<String, Value>,
        vars: &mut Variables<'a>,
    ) -> Result<IDeploymentTrigger> {
        let type_content = self.types.get(&id).context("Missing trigger type")?;
        let v = self.visit_content(access, "trigger", values, type_content, vars)?;
        Ok(IDeploymentTrigger {
            type_id: id,
            script: v.script.context("Missing script")?,
            content: v.content,
            title: v.deployment_title.to_string(),
        })
    }

    fn visit_triggers(
        &mut self,
        access: &mut OCellAccess<M>,
        obj: &'a impl ITriggersIter,
        node: &'a Node<'a, M>,
        vars: &mut Variables<'a>,
    ) {
        for (id, values) in obj.triggers_iter() {
            match self.visit_trigger(access, id, values, vars) {
                Ok(v) => {
                    if let DagNode::Normal { triggers, .. } = access.rw(node) {
                        triggers.push(v);
                    }
                }
                Err(e) => {
                    self.errors.push(format!(
                        "Error processing triger of type {} with content {:?}: {:?}",
                        id, values, e
                    ));
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn handle_contains(
        &mut self,
        access: &mut OCellAccess<M>,
        contains: &impl IContainsIter,
        node: &'a Node<'a, M>,
        sentinal: &'a Node<'a, M>,
        path: &mut Vec<i64>,
        prefix: &mut Vec<i64>,
        vars: &mut Variables<'a>,
    ) {
        for child_id in contains.contains_iter() {
            match self.visit(access, child_id, path, prefix, vars) {
                Ok((n, s)) => {
                    access.rw(n).base_mut().prev.push(node);
                    access.rw(node).base_mut().next.push(n);
                    access.rw(s).base_mut().next.push(sentinal);
                    access.rw(sentinal).base_mut().prev.push(s);
                }
                Err(e) => {
                    self.errors.push(format!("{:?}", e));
                }
            }
        }
    }

    fn handle_depends(
        &mut self,
        access: &mut OCellAccess<M>,
        deps: &impl IDependsIter,
        node: &'a Node<'a, M>,
    ) {
        for dep in deps.depends_iter() {
            if let Some((_, s)) = self.visit_top(access, dep) {
                access.rw(s).base_mut().next.push(node);
                access.rw(node).base_mut().prev.push(s);
            }
        }
    }

    fn visit(
        &mut self,
        access: &mut OCellAccess<M>,
        id: i64,
        path: &mut Vec<i64>,
        prefix: &mut Vec<i64>,
        vars: &mut Variables<'a>,
    ) -> Result<NodePair<'a, M>> {
        let l = prefix.iter().map(|v| num_len(*v) + 1).sum::<usize>()
            + num_len(id)
            + (if prefix.is_empty() { 1 } else { 0 });
        let name = self.string_arena.alloc_slice_repeated(access, 0, l);
        let mut nw = &mut *name;
        if prefix.is_empty() {
            // To match old behaivour
            write!(&mut nw, ".")?;
        }
        for v in prefix.iter() {
            write!(&mut nw, "{}.", v).context("num_len failed 1")?;
        }
        write!(&mut nw, "{}", id).context("num_len faile 2")?;
        let name = std::str::from_utf8(name).context("num_len failed 3")?;

        if let Some(v) = self.nodes.get(name) {
            return Ok(*v);
        }
        let parent_name = path
            .last()
            .and_then(|id| self.objects.get(id))
            .map(|v| v.name.as_str())
            .unwrap_or("root");
        let obj = self.objects.get(&id).with_context(|| {
            format!(
                "Missing object {} for host {} in {}",
                id, self.host_id, parent_name
            )
        })?;
        let type_id = obj.r#type;
        let type_content = self
            .types
            .get(&type_id)
            .with_context(|| format!("Missing type {} for object {}", type_id, id))?;
        let type_obj = self.objects.get(&type_id).context("Missing type")?;
        if path.contains(&id) {
            bail!(
                "{} contains {} of witch it is it self a member",
                parent_name,
                obj.name
            );
        }
        vars.push();
        let res = self.visit_inner(
            access,
            id,
            path,
            prefix,
            vars,
            name,
            obj,
            type_id,
            type_content,
            type_obj,
        );
        vars.pop()?;
        let (sentinal, node) = match res {
            Ok(v) => v,
            Err(e) => {
                return Err(e).context(format!(
                    "Error visiting object {} {} {} {})",
                    name, obj.name, type_id, id
                ));
            }
        };
        if type_content.has_depends.unwrap_or_default() {
            self.handle_depends(access, &obj.content, node);
        }
        self.handle_depends(access, &type_obj.content, node);
        Ok((node, sentinal))
    }

    #[allow(clippy::too_many_arguments)]
    fn visit_inner(
        &mut self,
        access: &mut OCellAccess<M>,
        id: i64,
        path: &mut Vec<i64>,
        prefix: &mut Vec<i64>,
        vars: &mut Variables<'a>,
        name: &'a str,
        obj: &'a Object,
        type_id: i64,
        type_content: &'a IType,
        type_obj: &'a Object,
    ) -> Result<NodePair<'a, M>> {
        if type_content.has_variables.unwrap_or_default() {
            self.add_variabels(vars, obj);
        }
        if let Some(nv) = &type_content.name_variable {
            if !nv.is_empty() {
                if let Err(e) = vars.add_str(nv.as_str(), &obj.name) {
                    self.errors
                        .push(format!("Failed to add varible {}: {:?}", nv, e));
                }
            }
        }
        let mut v = self.visit_content(access, &obj.name, &obj.content, type_content, vars)?;

        if type_content.has_sudo_on.unwrap_or_default() {
            let so = if let Some(Value::Array(v)) = obj.content.get("sudoOn") {
                v.iter().any(|v| v.as_i64() == Some(self.host_id))
            } else {
                false
            };
            v.content.insert("sudoOn".to_string(), Value::Bool(so));
        }

        v.content
            .insert("name".to_string(), Value::String(obj.name.clone()));
        let sentinal = self.node_arena.alloc(
            access,
            OCell::new(DagNode::Sentinal {
                base: DagNodeBase {
                    prev: Vec::new(),
                    next: Vec::new(),
                    in_count: 0,
                    type_order: 0,
                    id,
                },
                name: v.deployment_title,
            }),
        );
        let script = v
            .script
            .as_deref()
            .map(|v| self.string_arena.alloc_str(access, v));
        let node = self.node_arena.alloc(
            access,
            OCell::new(DagNode::Normal {
                base: DagNodeBase {
                    prev: Vec::new(),
                    next: Vec::new(),
                    in_count: 0,
                    type_order: 0,
                    id,
                },
                name,
                triggers: Vec::new(),
                deployment_title: v.deployment_title,
                script,
                content: v.content,
                type_id,
            }),
        );
        access.rw(sentinal).base_mut().prev.push(node);
        access.rw(node).base_mut().next.push(sentinal);
        self.nodes.insert(name, (node, sentinal));
        if type_content.has_triggers.unwrap_or_default() {
            self.visit_triggers(access, &obj.content, node, vars);
        }
        self.visit_triggers(access, &type_obj.content, node, vars);
        {
            path.push(id);
            let pushed_prefix = if vars.has_vars() {
                prefix.push(id);
                true
            } else {
                false
            };

            if type_content.has_contains.unwrap_or_default() {
                self.handle_contains(access, &obj.content, node, sentinal, path, prefix, vars);
            }
            self.handle_contains(
                access,
                &type_obj.content,
                node,
                sentinal,
                path,
                prefix,
                vars,
            );

            path.pop();
            if pushed_prefix {
                prefix.pop();
            }
        }
        Ok((sentinal, node))
    }

    // Visit an object contained directly in the host
    fn visit_top(&mut self, access: &mut OCellAccess<M>, id: i64) -> Option<NodePair<'a, M>> {
        if let Some(v) = self.tops.get(&id) {
            return *v;
        }
        if !self.top_visiting.insert(id) {
            self.errors.push("Cyclic dependency".to_string());
            return None;
        }
        let mut path = Vec::new();
        let mut prefix = Vec::new();
        let mut vars = Default::default();
        let c = match self.visit(access, id, &mut path, &mut prefix, &mut vars) {
            Ok(v) => Some(v),
            Err(e) => {
                self.errors.push(format!("Error visiting {}: {:?}", id, e));
                None
            }
        };
        self.tops.insert(id, c);
        self.top_visiting.remove(&id);
        c
    }
}

struct HeapElement<'a, M> {
    node: &'a Node<'a, M>,
    o: (i64, i64), // type_order, id
}

impl<'a, M> Deref for HeapElement<'a, M> {
    type Target = Node<'a, M>;

    fn deref(&self) -> &Self::Target {
        self.node
    }
}

impl<'a, M> HeapElement<'a, M> {
    fn new(access: &OCellAccess<M>, node: &'a Node<'a, M>) -> Self {
        let base = access.ro(node).base();
        Self {
            node,
            o: (base.type_order, base.id),
        }
    }
}
impl<M> Eq for HeapElement<'_, M> {}
impl<M> PartialEq for HeapElement<'_, M> {
    fn eq(&self, other: &Self) -> bool {
        self.o.eq(&other.o)
    }
}
impl<M> PartialOrd for HeapElement<'_, M> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl<M> Ord for HeapElement<'_, M> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.o.cmp(&other.o)
    }
}

#[allow(clippy::too_many_arguments)]
async fn setup_deployment_host<'a, M>(
    state: &State,
    access: &mut OCellAccess<M>,
    visitor: &mut Visitor<'a, M>,
    host_id: i64,
    deploy_id: Option<i64>,
    redeploy: bool,
    new_deployment_objects: &mut Vec<IDeploymentObject>,
    outer_vars: &mut Variables<'a>,
) -> Result<()> {
    let objects = visitor.objects;
    let host_object = objects
        .get(&host_id)
        .with_context(|| format!("Missing host {}", host_id))?;

    outer_vars.add_str("nodename", &host_object.name)?;
    let mut to_visit = vec![host_id];
    let mut visited = HashSet::new();
    while let Some(id) = to_visit.pop() {
        if !visited.insert(id) {
            continue;
        }
        let Some(obj) = objects.get(&id) else {
            continue;
        };
        match obj.r#type {
            HOST_ID | COLLECTION_ID | COMPLEX_COLLECTION_ID => {
                to_visit.extend(obj.content.contains_iter());
                to_visit.extend(obj.content.depends_iter());
            }
            HOST_VARIABLE_ID => {
                visitor.add_variabels(outer_vars, obj);
            }
            _ => {}
        }
    }
    visitor.add_variabels(outer_vars, host_object);

    std::mem::swap(&mut visitor.outer_vars, outer_vars);
    for dep_id in host_object.content.contains_iter() {
        visitor.visit_top(access, dep_id);
    }
    std::mem::swap(&mut visitor.outer_vars, outer_vars);

    if !visitor.errors.is_empty() {
        return Ok(());
    }

    let host_full = match deploy_id {
        None => true,
        Some(v) => v == host_id,
    };

    // Find all nodes reachable from deployId, and prep them for top sort
    #[allow(clippy::mutable_key_type)]
    let mut seen: HashSet<CmpRef<&'a Node<'a, M>>> = HashSet::new();
    let mut to_visit: Vec<&'a Node<'a, M>> = Vec::new();

    for (node, sentinal) in visitor.nodes.values() {
        match deploy_id {
            None => to_visit.push(sentinal),
            Some(deploy_id) => {
                let type_id = match access.ro(node) {
                    DagNode::Sentinal { .. } => continue,
                    DagNode::Normal { type_id, .. } => *type_id,
                };
                if host_full || access.ro(sentinal).base().id == deploy_id || type_id == deploy_id {
                    to_visit.push(sentinal);
                    seen.insert(CmpRef(sentinal));
                }
            }
        }
    }

    // There is nothing to deploy here
    if to_visit.is_empty() && !host_full {
        return Ok(());
    }

    // Perform topsort and construct deployment objects
    while let Some(node) = to_visit.pop() {
        let node = access.rw(node).base_mut();
        for prev in &node.prev {
            node.in_count += 1;
            if seen.insert(CmpRef(prev)) {
                to_visit.push(prev);
            }
        }
    }

    let mut pq = BinaryHeap::new();
    for node in &seen {
        let node = node.0;
        let n = access.rw(node).base_mut();
        n.type_order = objects
            .get(&n.id)
            .and_then(|v| visitor.types.get(&v.r#type))
            .and_then(|v| v.deploy_order)
            .unwrap_or_default();
        if n.in_count == 0 {
            pq.push(HeapElement::new(access, node));
        }
    }

    struct OldContent {
        content: IDeployContent,
        r#type: i64,
        title: String,
    }

    let mut old_content = HashMap::new();

    let rows = query!(
        "SELECT `name`, `content`, `type`, `title` FROM `deployments` WHERE `host`=?",
        host_id
    )
    .fetch_all(&state.db)
    .await
    .context("Failed to query deployments")?;

    for row in rows {
        let content = serde_json::from_str(&row.content).with_context(|| {
            format!(
                "Invalid deployment content for {}: {}",
                row.name, row.content
            )
        })?;
        old_content.insert(
            row.name,
            OldContent {
                content,
                r#type: row.r#type,
                title: row.title,
            },
        );
    }

    let mut host_deployment_objects = Vec::new();
    while let Some(v) = pq.pop() {
        let node = v.node;
        seen.remove(&CmpRef(node));
        let cnt = access.ro(node).base().next.len();
        for i in 0..cnt {
            let next = *access.ro(node).base().next.get(i).unwrap();
            if !seen.contains(&CmpRef(next)) {
                continue;
            }
            access.rw(next).base_mut().in_count -= 1;
            if access.ro(next).base().in_count == 0 {
                pq.push(HeapElement::new(access, next));
            }
        }
        let node = access.rw(node);
        let DagNode::Normal {
            base,
            name,
            triggers,
            deployment_title,
            script,
            content,
            type_id,
        } = node
        else {
            continue;
        };
        if !objects.contains_key(&base.id) {
            continue;
        };
        let type_content = visitor.types.get(type_id).context("Missing type")?;
        let type_object = objects.get(type_id).context("Missing type")?;
        if matches!(
            type_content.kind,
            Some(KindType::Host | KindType::Root | KindType::Collection | KindType::Hostvar)
        ) {
            continue;
        }

        let mut o = IDeploymentObject {
            index: 0,
            host: host_id,
            host_name: host_object.name.clone(),
            title: deployment_title.to_string(),
            name: name.to_string(),
            enabled: true,
            status: DeploymentObjectStatus::Normal,
            action: DeploymentObjectAction::Add,
            script: script.context("Missing script")?.to_owned(),
            prev_script: Some("".to_string()),
            next_content: Some(std::mem::take(content)),
            prev_content: None,
            id: Some(base.id),
            type_id: *type_id,
            type_name: type_object.name.clone(),
            triggers: std::mem::take(triggers),
            deployment_order: base.type_order,
        };

        if let Some(v) = old_content.remove(*name) {
            if !redeploy {
                let content = v.content;
                o.prev_content = content.content;
                o.prev_script = content.script;
                o.action = DeploymentObjectAction::Modify;
            }
        }
        host_deployment_objects.push(o);
    }

    if !seen.is_empty() {
        let mut shortest_cycle: Option<Vec<_>> = None;
        for seed in &seen {
            let seed = CmpRef(seed.0);
            #[allow(clippy::mutable_key_type)]
            let mut back = HashMap::new();
            let mut s1 = Vec::new();
            let mut s2 = Vec::new();
            for &n in &access.ro(seed.0).base().next {
                back.insert(CmpRef(n), seed);
                s2.push(CmpRef(n));
            }
            while !s1.is_empty() || !s2.is_empty() {
                if s1.is_empty() {
                    while let Some(v) = s2.pop() {
                        s1.push(v)
                    }
                }
                let mut n = s1.pop().unwrap();
                let mut cycle_found = false;
                for &m in &access.ro(&n).base().next {
                    let m = CmpRef(m);
                    if m == seed {
                        cycle_found = true;
                        break;
                    }
                    if let std::collections::hash_map::Entry::Vacant(e) = back.entry(m) {
                        e.insert(n);
                        s2.push(m);
                    }
                }
                if cycle_found {
                    let mut cycle = vec![seed];
                    while n != seed {
                        cycle.push(n);
                        let Some(&m) = back.get(&n) else {
                            bail!("Internal error")
                        };
                        n = m;
                    }
                    cycle.push(seed);
                    if !shortest_cycle
                        .as_ref()
                        .map(|v| v.len() >= cycle.len())
                        .unwrap_or_default()
                    {
                        shortest_cycle = Some(cycle);
                    }
                    break;
                }
            }
        }
        let Some(shortest_cycle) = shortest_cycle else {
            bail!("No cycle found")
        };

        let mut error = Vec::new();
        write!(
            &mut error,
            "There is a cycle on host {}: ",
            host_object.name
        )?;
        for (i, n) in shortest_cycle.iter().enumerate() {
            if i != 0 {
                write!(&mut error, " -> ")?;
            }
            match access.ro(n) {
                DagNode::Sentinal { name, .. } => write!(&mut error, "Sent {}", name)?,
                DagNode::Normal {
                    deployment_title, ..
                } => write!(&mut error, "{}", deployment_title)?,
            }
        }
        visitor.errors.push(String::from_utf8(error)?)
    }

    if !host_object
        .content
        .get("debPackages")
        .map(|v| v.as_bool().unwrap_or_default())
        .unwrap_or(true)
    {
        host_deployment_objects.retain(|o| o.type_id != PACKAGE_ID);
    }

    // Filter away stuff that has not changed
    host_deployment_objects.retain(|o| {
        o.next_content != o.prev_content || Some(o.script.as_str()) != o.prev_script.as_deref()
    });

    // Find stuff to remove
    if host_full {
        let mut values: Vec<_> = old_content.into_iter().collect();

        values.sort_by(|(ln, lc), (rn, rc)| {
            let o = lc
                .content
                .deployment_order
                .cmp(&rc.content.deployment_order);
            if o.is_ne() {
                o
            } else {
                ln.cmp(rn)
            }
        });

        for (name, v) in values {
            host_deployment_objects.push(IDeploymentObject {
                index: 0,
                host: host_id,
                host_name: host_object.name.clone(),
                title: v.title,
                name,
                enabled: true,
                status: DeploymentObjectStatus::Normal,
                action: DeploymentObjectAction::Remove,
                script: v.content.script.context("Missing script")?,
                prev_script: None,
                next_content: None,
                prev_content: v.content.content,
                id: Some(v.content.object),
                type_id: v.r#type,
                type_name: v.content.type_name,
                triggers: v.content.triggers,
                deployment_order: v.content.deployment_order,
            });
        }
    }

    let mut triggers = Vec::new();
    for o in host_deployment_objects {
        for trigger in &o.triggers {
            triggers.push(trigger.clone());
        }
        new_deployment_objects.push(o)
    }

    triggers.sort_by(|l, r| {
        l.type_id
            .cmp(&r.type_id)
            .then_with(|| l.script.cmp(&r.script))
            .then_with(|| l.content.json_cmp(&r.content))
    });
    triggers
        .dedup_by(|l, r| l.type_id == r.type_id && l.script == r.script && l.content == r.content);

    for t in triggers {
        new_deployment_objects.push(IDeploymentObject {
            index: 0,
            host: host_id,
            host_name: host_object.name.clone(),
            title: t.title,
            name: "".to_string(),
            enabled: true,
            status: DeploymentObjectStatus::Normal,
            action: DeploymentObjectAction::Trigger,
            script: t.script,
            prev_script: None,
            next_content: Some(t.content),
            prev_content: None,
            id: None,
            type_id: t.type_id,
            type_name: objects
                .get(&t.type_id)
                .map(|v| v.name.clone())
                .unwrap_or_default(),
            triggers: Vec::new(),
            deployment_order: 0,
        })
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn setup_deployment_inner<'a, M>(
    objects: &'a HashMap<i64, Object>,
    types: &'a HashMap<i64, IType>,
    hosts: &'a Vec<i64>,
    state: &State,
    deploy_id: Option<i64>,
    redeploy: bool,
    node_arena: &'a Arena<OCell<M, DagNode<'a, M>>, M>,
    string_arena: &'a Arena<u8, M>,
    access: &mut OCellAccess<M>,
) -> Result<()> {
    let mut visitor = Visitor {
        objects,
        types,
        errors: Default::default(),
        tops: Default::default(),
        top_visiting: Default::default(),
        node_arena,
        string_arena,
        nodes: Default::default(),
        host_id: -1,
        outer_vars: Default::default(),
    };

    let root = objects
        .get(&ROOT_INSTANCE_ID)
        .context("Missing root object")?;
    let root_type = types.get(&root.r#type).context("Missing root type")?;

    let mut outer_vars = Variables::default();
    outer_vars.add_str("user", "root")?;
    outer_vars.add_str("editor", "vim")?;
    visitor.add_variabels(&mut outer_vars, root);
    visitor
        .visit_content(access, "root", &root.content, root_type, &mut outer_vars)
        .context("Error visiting root content")?;

    let mut new_deployment_objects = Vec::new();

    // Find deployment objects on a host by host basis
    for &host_id in hosts {
        visitor.host_id = host_id;
        visitor.nodes.clear();
        visitor.tops.clear();
        visitor.top_visiting.clear();
        visitor.errors.clear();
        outer_vars.push();
        let res = setup_deployment_host(
            state,
            access,
            &mut visitor,
            host_id,
            deploy_id,
            redeploy,
            &mut new_deployment_objects,
            &mut outer_vars,
        )
        .await;
        outer_vars.pop()?;
        res.with_context(|| {
            format!(
                "Error setting up host {}({})",
                objects
                    .get(&host_id)
                    .map(|v| v.name.as_str())
                    .unwrap_or("Missing"),
                host_id
            )
        })?;
    }
    if !visitor.errors.is_empty() {
        let message = visitor.errors.join("\n");
        mut_deployment(state, move |deployment| {
            deployment.set_status(DeploymentStatus::InvilidTree);
            deployment.set_message(message);
            Ok(())
        })
        .await?;
        return Ok(());
    }

    for (i, o) in new_deployment_objects.iter_mut().enumerate() {
        o.index = i;
    }

    mut_deployment(state, move |deployment| {
        if new_deployment_objects.is_empty() {
            deployment.set_status(DeploymentStatus::Done);
            deployment.set_message("Everything up to date, nothing to deploy!".to_string());
        } else {
            deployment.set_status(DeploymentStatus::ReviewChanges);
            deployment.set_message("".to_string());
        }
        deployment.set_deploment_objects(new_deployment_objects);
        Ok(())
    })
    .await?;
    Ok(())
}

async fn deploy_single(
    state: &State,
    host_client: Option<Arc<HostClient>>,
    script: String,
    content: Value,
) -> Result<()> {
    let Some(host_client) = host_client else {
        return Ok(());
    };
    let mut jh = host_client
        .start_job(&HostClientMessage::RunScript(RunScriptMessage {
            id: host_client.next_job_id(),
            name: "deploy.py".to_string(),
            interperter: "/usr/bin/python3".to_string(),
            content: script,
            args: vec![],
            input_json: Some(content),
            stdin_type: Some(RunScriptStdinType::GivenJson),
            stdout_type: Some(RunScriptOutType::Binary),
            stderr_type: Some(RunScriptOutType::Binary),
        }))
        .await?;
    loop {
        let msg = jh.next_message().await?.context("Host went away")?;
        match msg {
            ClientHostMessage::Failure(msg) => {
                jh.done();
                bail!("Command failed {:?}", msg.failure_type);
            }
            ClientHostMessage::Success(msg) => {
                jh.done();
                if msg.code == Some(0) {
                    return Ok(());
                }
                bail!("Command failed with code {:?}", msg.code)
            }
            ClientHostMessage::Data(msg) => {
                mut_deployment(state, move |deployment| {
                    let data = msg.data.as_str().context("Expected string")?;
                    let line = String::from_utf8(BASE64_STANDARD.decode(data)?)?;
                    deployment.add_log(line);
                    Ok(())
                })
                .await?;
            }
            _ => bail!("Got unexpected message"),
        }
    }
}

async fn setup_deployment_object_types_and_hosts(
    state: &State,
) -> Result<(HashMap<i64, Object>, HashMap<i64, IType>, Vec<i64>)> {
    let rows = query!(
        "SELECT `id`, `type`, `name`, `content` FROM `objects` WHERE `newest` ORDER BY `id`"
    )
    .fetch_all(&state.db)
    .await?;
    let mut objects = HashMap::new();
    let mut types = HashMap::new();
    let mut hosts = Vec::new();
    for r in rows {
        match r.r#type {
            HOST_ID => hosts.push(r.id),
            TYPE_ID => {
                types.insert(r.id, serde_json::from_str(&r.content)?);
            }
            _ => (),
        }
        objects.insert(
            r.id,
            Object {
                name: r.name,
                r#type: r.r#type,
                content: serde_json::from_str(&r.content)?,
            },
        );
    }
    Ok((objects, types, hosts))
}

pub async fn setup_deployment(
    state: &State,
    deploy_id: Option<i64>,
    redeploy: bool,
    cancel: bool,
) -> Result<()> {
    if mut_deployment(state, move |deployment| {
        if deployment.status != DeploymentStatus::Done
            && (!cancel || deployment.status != DeploymentStatus::ReviewChanges)
        {
            return Ok(true);
        }
        deployment.set_status(DeploymentStatus::BuildingTree);
        deployment.set_message("".to_string());
        deployment.clear_log();
        Ok(false)
    })
    .await?
    {
        return Ok(());
    }

    let (objects, types, hosts) = match setup_deployment_object_types_and_hosts(state).await {
        Ok(v) => v,
        Err(e) => {
            mut_deployment(state, |deployment| {
                deployment.set_status(DeploymentStatus::InvilidTree);
                deployment.set_message(format!("{:?}", e));
                Ok(())
            })
            .await?;
            error!("Error in setup deployment: {:?}", e);
            return Ok(());
        }
    };

    let mut access = unsafe {
        struct Marker;
        OCellAccess::<Marker>::new()
    };
    let node_arena = Arena::default();
    let string_arena = Arena::default();
    if let Err(e) = setup_deployment_inner(
        &objects,
        &types,
        &hosts,
        state,
        deploy_id,
        redeploy,
        &node_arena,
        &string_arena,
        &mut access,
    )
    .await
    {
        mut_deployment(state, |deployment| {
            deployment.set_status(DeploymentStatus::InvilidTree);
            deployment.set_message(format!("{:?}", e));
            Ok(())
        })
        .await?;
        error!("Error in setup deployment: {:?}", e);
    }
    Ok(())
}

async fn perform_deploy(state: &State, mark_only: bool) -> Result<()> {
    let Some(deployment_objects) = mut_deployment(state, |deployment| {
        if deployment.status != DeploymentStatus::ReviewChanges {
            return Ok(None);
        }
        deployment.set_status(DeploymentStatus::Deploying);
        deployment.add_log("Deployment started\r\n".to_string());
        Ok(Some(deployment.deployment_objects.clone()))
    })
    .await?
    else {
        return Ok(());
    };

    let rows = query_as!(
        ObjectRow,
        "SELECT `id`, `name`, `content`, `category`, `version`, `comment`,
        strftime('%s', `time`) AS `time`, `author`, `type` FROM `objects`
        WHERE `newest` AND `type`=? ORDER BY `id`",
        TYPE_ID
    )
    .fetch_all(&state.db)
    .await?;

    let mut types = HashMap::new();
    for row in rows {
        let t: IObject2<IType> = row.try_into()?;
        types.insert(t.id, t);
    }

    let mut bad_host = false;
    let mut cur_host = -1;
    let mut host_objects: HashMap<_, ValueMap> = HashMap::new();
    let mut it = deployment_objects.into_iter().enumerate().peekable();
    while let Some((index, mut object)) = it.next() {
        if !object.enabled {
            continue;
        }

        if object.host != cur_host {
            bad_host = false;
            cur_host = object.host;

            mut_deployment(state, |deployment| {
                deployment.add_header(&object.host_name, true);
                Ok(())
            })
            .await?;

            host_objects.clear();
            let res = query!(
                "SELECT `name`, `content`, `type`, `title` FROM `deployments` WHERE `host`=?",
                cur_host
            )
            .fetch_all(&state.db)
            .await?;
            for row in res {
                let c: IDeployContent = serde_json::from_str(&row.content)?;
                host_objects
                    .entry(row.r#type)
                    .or_default()
                    .insert(row.name, Value::Object(c.content.unwrap_or_default()));
            }
        }

        if bad_host {
            mut_deployment(state, |deployment| {
                deployment.set_object_status(index, DeploymentObjectStatus::Failure);
                Ok(())
            })
            .await?;
            continue;
        }

        let host_client = if mark_only {
            None
        } else {
            let Some(host_client) = state
                .host_clients
                .lock()
                .unwrap()
                .get(&object.host)
                .cloned()
            else {
                bad_host = true;
                mut_deployment(state, |deployment| {
                    deployment.add_log(format!("Host {} is down\r\n", object.host_name));
                    deployment.set_object_status(index, DeploymentObjectStatus::Failure);
                    Ok(())
                })
                .await?;
                continue;
            };
            Some(host_client)
        };

        let type_id = object.type_id;
        let t = types.get(&type_id);
        let type_kind = t.as_ref().and_then(|v| v.content.kind.clone());

        if type_kind == Some(KindType::Sum) {
            let next_objects = host_objects.entry(type_id).or_default();
            // Temp workaronud for broken objects
            next_objects.retain(|_, v| v.as_object().map(|v| !v.is_empty()).unwrap_or_default());

            let script = std::mem::take(&mut object.script);
            let mut sum_objects = vec![(index, object)];
            while let Some((_, o2)) = it.peek() {
                if !o2.enabled {
                    continue;
                }
                if o2.type_id != type_id || o2.host != cur_host {
                    break;
                }
                sum_objects.push(it.next().unwrap());
            }

            for (_, o2) in &sum_objects {
                if o2.prev_content.is_some() {
                    next_objects.remove(&o2.name);
                }
                if let Some(c) = o2.next_content.clone() {
                    if !c.is_empty() {
                        next_objects.insert(o2.name.clone(), c.into());
                    }
                }
            }

            mut_deployment(state, |deployment| {
                for (i2, _) in &sum_objects {
                    deployment.set_object_status(*i2, DeploymentObjectStatus::Deplying);
                }
                Ok(())
            })
            .await?;

            let mut m = ValueMap::new();
            m.insert("objects".to_string(), Value::Object(next_objects.clone()));
            let ret = deploy_single(state, host_client, script, Value::Object(m)).await;

            if let Err(e) = ret {
                mut_deployment(state, |deployment| {
                    for (i2, _) in &sum_objects {
                        deployment.set_object_status(*i2, DeploymentObjectStatus::Failure);
                    }
                    deployment.add_log(format!("{:?}", e));
                    Ok(())
                })
                .await?;
                bad_host = true;
            } else {
                mut_deployment(state, |deployment| {
                    for (i2, _) in &sum_objects {
                        deployment.set_object_status(*i2, DeploymentObjectStatus::Success);
                    }
                    Ok(())
                })
                .await?;
                for (_, o2) in sum_objects {
                    set_deployment(state, o2, type_id).await?;
                }
            }
            continue;
        }

        mut_deployment(state, |deployment| {
            deployment.add_header(&format!("{} ({})", &object.title, &object.type_name), false);
            deployment.set_object_status(index, DeploymentObjectStatus::Deplying);
            Ok(())
        })
        .await?;

        let ret = if type_kind == Some(KindType::Trigger) {
            deploy_single(
                state,
                host_client,
                object.script.clone(),
                object.next_content.clone().into(),
            )
            .await
        } else if matches!(type_kind, None | Some(KindType::Delta)) {
            let mut m = ValueMap::new();
            m.insert("old".to_string(), object.prev_content.clone().into());
            m.insert("new".to_string(), object.next_content.clone().into());
            deploy_single(state, host_client, object.script.clone(), m.into()).await
        } else {
            Err(anyhow!("Unhandled object type_kind {:?}", type_kind))
        };
        let ok = ret.is_ok();
        if let Err(e) = ret {
            mut_deployment(state, move |deployment| {
                deployment.add_log(format!("{:?}", e));
                Ok(())
            })
            .await?;
            if type_kind != Some(KindType::Trigger) {
                bad_host = true;
            }
        } else if type_kind != Some(KindType::Trigger) && type_kind.is_some() {
            set_deployment(state, object, type_id).await?;
        }
        mut_deployment(state, |deployment| {
            deployment.set_object_status(
                index,
                if ok {
                    DeploymentObjectStatus::Success
                } else {
                    DeploymentObjectStatus::Failure
                },
            );
            Ok(())
        })
        .await?;
    }

    mut_deployment(state, |deployment| {
        deployment.set_status(DeploymentStatus::Done);
        Ok(())
    })
    .await?;
    Ok(())
}

async fn set_deployment(
    state: &State,
    object: IDeploymentObject,
    type_id: i64,
) -> Result<(), anyhow::Error> {
    if let Some(content) = object.next_content {
        let content = IDeployContent {
            script: Some(object.script),
            content: Some(content),
            triggers: object.triggers,
            deployment_order: object.deployment_order,
            type_name: object.type_name,
            object: object.id.context("Missisng id")?,
        };
        let content = serde_json::to_string(&content)?;
        query!(
            "REPLACE INTO `deployments`
                    (`host`, `name`, `content`, `time`, `type`, `title`)
                    VALUES (?, ?, ?, datetime('now'), ?, ?)",
            object.host,
            object.name,
            content,
            type_id,
            object.title
        )
        .execute(&state.db)
        .await?;
    } else {
        query!(
            "DELETE FROM `deployments` WHERE `host`=? AND `name`=?",
            object.host,
            object.name,
        )
        .execute(&state.db)
        .await?;
    }
    Ok(())
}


pub async fn start(state: &State) -> Result<()> {
    perform_deploy(state, false).await?;
    Ok(())
}

pub async fn mark_deployed(state: &State) -> Result<()> {
    perform_deploy(state, true).await?;
    Ok(())
}

pub async fn stop(state: &State) -> Result<()> {
    let actions = {
        let mut deployment = state.deployment.lock().unwrap();
        if deployment.status != DeploymentStatus::Deploying {
            return Ok(());
        }
        deployment.set_status(DeploymentStatus::Done);
        deployment.take_actions()
    };
    //TODO we should wait for the current action to finish
    for action in actions {
        webclient::broadcast(state, action)?;
    }
    Ok(())
}

pub async fn cancel(state: &State) -> Result<()> {
    let actions = {
        let mut deployment = state.deployment.lock().unwrap();
        if deployment.status != DeploymentStatus::ReviewChanges {
            return Ok(());
        }
        deployment.set_status(DeploymentStatus::Done);
        deployment.set_deploment_objects(Vec::new());
        deployment.set_message("".to_string());
        deployment.take_actions()
    };
    for action in actions {
        webclient::broadcast(state, action)?;
    }
    Ok(())
}

pub async fn toggle_object(state: &State, index: Option<usize>, enabled: bool) -> Result<()> {
    {
        let mut deployment = state.deployment.lock().unwrap();
        if deployment.status != DeploymentStatus::ReviewChanges {
            return Ok(());
        }
        if let Some(index) = index {
            if let Some(o) = deployment.deployment_objects.get_mut(index) {
                o.enabled = enabled;
            } else {
                return Ok(());
            }
        } else {
            for o in &mut deployment.deployment_objects {
                o.enabled = enabled;
            }
        }
    }
    webclient::broadcast(
        state,
        IServerAction::ToggleDeploymentObject(IToggleDeploymentObject {
            index,
            enabled,
            source: ISource::Server,
        }),
    )?;
    Ok(())
}
