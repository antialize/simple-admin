use std::collections::HashSet;

use anyhow::Result;
use sadmin2::{
    action_types::IAuthStatus,
    type_types::{HOST_ID, IContainsIter, IDependsIter, USER_ID, ValueMap},
};

use crate::{db, state::State};

/// Returns true when `sslname` grants the `ssh` capability.
///
/// The sslname has the shape `user.uid.cap1~cap2~...` (see the equivalent
/// parsing in `WebClient::handle_generate_key_inner`): the capability list is
/// the part after the second `.` with individual capabilities separated by `~`.
fn has_ssh_cap(sslname: &str) -> bool {
    let Some((_uname, rem)) = sslname.split_once('.') else {
        return false;
    };
    let Some((_uid, caps_string)) = rem.split_once('.') else {
        return false;
    };
    caps_string.split('~').any(|v| v == "ssh")
}

/// Check whether the given (already authenticated) user may open a shell or
/// run a command on the host identified by `host_id`.
///
/// This grants access to an admin, or to a user who
///  * has the `ssh` capability in their sslname, and
///  * either has `sudo` set on the user object, or has the host listed in the
///    user object's `sudoOn` list, and
///  * is present in the host's deploy tree (reachable from the host object via
///    `contains`/`depends`).
///
/// Users hard-coded in the server config get `admin = true` in `get_auth`, so
/// they always pass through the admin shortcut below.
pub async fn check_shell_run_auth(state: &State, auth: &IAuthStatus, host_id: i64) -> Result<bool> {
    // Admins always have access.
    if auth.admin {
        return Ok(true);
    }

    // All remaining rules require an authenticated, fully (pwd + otp) verified
    // user with a known sslname.
    if !auth.auth {
        return Ok(false);
    }
    let Some(user) = auth.user.as_deref() else {
        return Ok(false);
    };

    let Some(user_obj) =
        db::get_object_by_name_and_type::<ValueMap>(state, user.to_string(), USER_ID).await?
    else {
        return Ok(false);
    };
    let user_content = &user_obj.content;
    if !user_content
        .get("sslname")
        .and_then(|v| v.as_str())
        .map(has_ssh_cap)
        .unwrap_or(false)
    {
        return Ok(false);
    }

    // `sudo` bit or the host being listed in the user's `sudoOn` list.
    let has_sudo = user_content
        .get("sudo")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let sudo_on_host = user_content
        .get("sudoOn")
        .and_then(|v| v.as_array())
        .map(|hosts| hosts.iter().any(|id| id.as_i64() == Some(host_id)))
        .unwrap_or(false);
    if !has_sudo && !sudo_on_host {
        return Ok(false);
    }

    // The user object must be part of the host's deploy tree.
    in_host_deploy_tree(state, host_id, user_obj.id).await
}

/// Walk the host object's `contains`/`depends` graph and report whether the
/// object with id `target` is reachable (i.e. part of the host's deploy tree).
async fn in_host_deploy_tree(state: &State, host_id: i64, target: i64) -> Result<bool> {
    let Some(host) = db::get_object_by_id_and_type::<ValueMap>(state, host_id, HOST_ID).await?
    else {
        return Ok(false);
    };
    let mut visited = HashSet::new();
    let mut to_visit: Vec<i64> = Vec::new();
    to_visit.extend(host.content.contains_iter());
    to_visit.extend(host.content.depends_iter());
    while let Some(id) = to_visit.pop() {
        if id == target {
            return Ok(true);
        }
        if !visited.insert(id) {
            continue;
        }
        let Some(obj) = db::get_newest_object_by_id::<ValueMap>(state, id).await? else {
            continue;
        };
        to_visit.extend(obj.content.contains_iter());
        to_visit.extend(obj.content.depends_iter());
    }
    Ok(false)
}
