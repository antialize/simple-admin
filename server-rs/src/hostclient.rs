use std::{
    collections::HashMap,
    sync::{atomic::AtomicU64, Arc, Mutex, Weak},
};

use anyhow::{bail, Result};
use log::error;
use neon::{
    event::Channel,
    handle::{Handle, Root},
    object::Object,
    types::{
        extract::{Boxed, Error, Json},
        Finalize, JsObject,
    },
};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

use crate::{client_message::ClientMessage, state::State};

pub struct JobHandle {
    client: Weak<HostClient>,
    id: u64,
    reciever: UnboundedReceiver<ClientMessage>,
    should_kill: bool,
}

impl JobHandle {
    pub async fn next_message(&mut self) -> Result<Option<ClientMessage>> {
        Ok(self.reciever.recv().await)
    }

    pub fn done(mut self) {
        self.should_kill = false;
    }
}

impl Drop for JobHandle {
    fn drop(&mut self) {
        if let Some(client) = self.client.upgrade() {
            client.job_sinks.lock().unwrap().remove(&self.id);
            if self.should_kill {
                client.spawn_kill_job(self.id);
            }
        }
    }
}

pub struct HostClient {
    channel: Channel,
    js_host_client: Arc<Root<JsObject>>,
    job_sinks: Mutex<HashMap<u64, UnboundedSender<ClientMessage>>>,
    next_job_id: AtomicU64,
}

impl HostClient {
    pub fn next_job_id(&self) -> u64 {
        self.next_job_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    pub async fn send_message(self: &Self, msg: ClientMessage) -> Result<()> {
        let obj = self.js_host_client.clone();
        self.channel
            .try_send(move |mut cx| {
                let h = obj.to_inner(&mut cx);
                let mut m = h.method(&mut cx, "sendMessage")?;
                m.this(h)?;
                m.arg(Json(msg))?;
                m.exec()?;
                Ok(())
            })?
            .await?;
        Ok(())
    }

    pub async fn start_job(self: &Arc<Self>, msg: ClientMessage) -> Result<JobHandle> {
        let Some(id) = msg.job_id() else {
            bail!("Not a job message")
        };
        let (sender, reciever) = tokio::sync::mpsc::unbounded_channel();
        let mut handle = JobHandle {
            client: Arc::downgrade(self),
            id,
            reciever,
            should_kill: false,
        };
        if self.job_sinks.lock().unwrap().insert(id, sender).is_some() {
            bail!("Job id in use");
        }
        handle.should_kill = true;
        self.send_message(msg).await?;
        Ok(handle)
    }

    pub async fn kill_job(self: Arc<Self>, id: u64) -> Result<()> {
        self.send_message(ClientMessage::Kill { id }).await?;
        Ok(())
    }

    pub fn spawn_kill_job(self: Arc<Self>, id: u64) {
        tokio::spawn(self.kill_job(id));
    }

    async fn handle_message(self: Arc<Self>, msg: ClientMessage) -> Result<()> {
        if let Some(id) = msg.job_id() {
            if let Some(job) = self.job_sinks.lock().unwrap().get(&id) {
                if let Err(e) = job.send(msg) {
                    error!("Unable to handle job message: {:?}", e);
                } else {
                    return Ok(());
                }
            } else {
                error!("Got message from unknown job");
            }
            self.spawn_kill_job(id);
        }
        Ok(())
    }
}

impl Finalize for HostClient {}

#[neon::export(context, name = "handleClientMessage")]
async fn handle_message(
    ch: Channel,
    Boxed(_): Boxed<Arc<State>>,
    obj: Root<JsObject>,
    Json(msg): Json<ClientMessage>,
) -> Result<(), Error> {
    let client = ch
        .try_send(move |mut cx| {
            let obj = obj.to_inner(&mut cx);
            let Boxed(client): Boxed<Arc<HostClient>> = obj.prop(&mut cx, "rsPart").get()?;
            Ok(client)
        })?
        .await?;
    match client.handle_message(msg).await {
        Err(e) => {
            error!("Error in HostClient::handle_message: {:?}", e);
            Err(e.into())
        }
        _ => Ok(()),
    }
}

#[neon::export(context, name = "constructHostClientRsPart")]
async fn construct_host_client(
    ch: Channel,
    Boxed(_): Boxed<Arc<State>>,
    obj: Root<JsObject>,
) -> Result<Boxed<Arc<HostClient>>, Error> {
    Ok(Boxed(Arc::new(HostClient {
        js_host_client: Arc::new(obj),
        channel: ch,
        job_sinks: Default::default(),
        next_job_id: AtomicU64::new(2199023255552),
    })))
}

#[neon::export(name = "killHostClient")]
fn kill_host_client(
    Boxed(_): Boxed<Arc<State>>,
    Boxed(obj): Boxed<Arc<HostClient>>,
) -> Result<(), Error> {
    obj.job_sinks.lock().unwrap().clear();
    Ok(())
}

pub async fn get_host_client_by_id(state: &State, id: i64) -> Result<Option<Arc<HostClient>>> {
    let instances = state.instances.clone();
    let hc = state
        .ch
        .try_send(move |mut cx| {
            let h = instances.to_inner(&mut cx);
            let hcs: Handle<JsObject> = h.prop(&mut cx, "hostClients").get()?;
            let mut m = hcs.method(&mut cx, "getRsById")?;
            m.this(hcs)?;
            m.arg(id as f64)?;
            let hc: Option<Boxed<Arc<HostClient>>> = m.call()?;
            Ok(hc.map(|Boxed(v)| v))
        })?
        .await?;
    Ok(hc)
}
