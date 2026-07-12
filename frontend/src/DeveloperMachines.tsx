import { Button, Chip, Collapse, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpOutlineIcon from "@mui/icons-material/Help";
import { observer } from "mobx-react";
import { useState } from "react";
import type { IVantaMachine, JsonValue } from "./shared_types";
import state from "./state";
import nullCheck from "./nullCheck";
import UnixTime from "./UnixTime";

function StatusChip({ label, enabled }: { label: string; enabled: boolean | null }) {
    if (enabled === null)
        return (
            <Chip
                size="small"
                icon={<HelpOutlineIcon />}
                label={label}
                color="default"
                variant="outlined"
                sx={{ mr: 0.5 }}
            />
        );
    return (
        <Chip
            size="small"
            icon={enabled ? <CheckCircleIcon /> : <CancelIcon />}
            label={label}
            color={enabled ? "success" : "error"}
            variant="outlined"
            sx={{ mr: 0.5 }}
        />
    );
}

function boolField(status: JsonValue | null | undefined, field: string): boolean | null {
    if (!status || typeof status !== "object" || Array.isArray(status)) return null;
    const v = (status as Record<string, JsonValue>)[field];
    if (typeof v === "boolean") return v;
    return null;
}

function strField(
    status: JsonValue | null | undefined,
    field: string,
): string | null {
    if (!status || typeof status !== "object" || Array.isArray(status)) return null;
    const v = (status as Record<string, JsonValue>)[field];
    if (typeof v === "string") return v;
    return null;
}

const MachineRow = observer(function MachineRow({ machine }: { machine: IVantaMachine }) {
    const [expanded, setExpanded] = useState(false);
    const isOwn = state.authUser === machine.username;
    const canRemove = isOwn || state.authAdmin;
    const s = machine.last_status;

    // Navigate nested JsonValue fields
    const firewall = boolField((s as Record<string, JsonValue>)?.["firewall"] ?? null, "enabled");
    const disk = boolField((s as Record<string, JsonValue>)?.["disk_encryption"] ?? null, "enabled");
    const lock = boolField((s as Record<string, JsonValue>)?.["screen_lock"] ?? null, "enabled");

    const kernelVer = strField(s, "kernel_version");
    const osPretty = strField((s as Record<string, JsonValue>)?.["os_release"] ?? null, "pretty_name");

    return (
        <>
            <TableRow hover>
                <TableCell>
                    <code>{machine.hostname}</code>
                </TableCell>
                {state.authAdmin && <TableCell>{machine.username}</TableCell>}
                <TableCell>
                    <Typography variant="caption" color="text.secondary">
                        {osPretty ?? "—"}
                        {kernelVer && ` (${kernelVer})`}
                    </Typography>
                </TableCell>
                <TableCell>
                    {machine.last_contact ? (
                        <UnixTime time={machine.last_contact} />
                    ) : (
                        <Typography variant="caption" color="text.disabled">
                            never
                        </Typography>
                    )}
                </TableCell>
                <TableCell>
                    <StatusChip label="Firewall" enabled={firewall} />
                    <StatusChip label="Disk" enabled={disk} />
                    <StatusChip label="Lock" enabled={lock} />
                </TableCell>
                <TableCell align="right">
                    <Tooltip title="Show last scan details">
                        <IconButton size="small" onClick={() => setExpanded((e) => !e)}>
                            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                    </Tooltip>
                    {canRemove && (
                        <Tooltip title="Remove machine">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            `Remove machine ${machine.hostname} (${machine.host_uuid})?`,
                                        )
                                    ) {
                                        nullCheck(state.developerMachines).removeMachine(
                                            machine.host_uuid,
                                        );
                                    }
                                }}
                            >
                                <DeleteIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={state.authAdmin ? 6 : 5} sx={{ pb: 0, pt: 0 }}>
                    <Collapse in={expanded} unmountOnExit>
                        <pre
                            style={{
                                fontSize: "0.75rem",
                                overflowX: "auto",
                                margin: "8px 0",
                            }}
                        >
                            {JSON.stringify(machine.last_status, null, 2) ?? "No scan data yet."}
                        </pre>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
});

export const DeveloperMachines = observer(function DeveloperMachines() {
    const dm = state.developerMachines;
    if (!dm) return null;

    if (dm.machines === null && !dm.loading) {
        dm.load();
    }

    return (
        <div style={{ padding: 16 }}>
            <Typography variant="h6" gutterBottom>
                Developer Machines
            </Typography>
            {dm.error && (
                <Typography color="error" component="p">
                    {dm.error}
                </Typography>
            )}
            {dm.loading && <Typography color="text.secondary">Loading…</Typography>}
            {dm.machines !== null && (
                <>
                    <Button
                        size="small"
                        variant="outlined"
                        sx={{ mb: 1 }}
                        onClick={() => {
                            dm.machines = null;
                            dm.load();
                        }}
                    >
                        Refresh
                    </Button>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Hostname</TableCell>
                                {state.authAdmin && <TableCell>User</TableCell>}
                                <TableCell>OS</TableCell>
                                <TableCell>Last contact</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {dm.machines.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={state.authAdmin ? 6 : 5}>
                                        <Typography color="text.secondary">
                                            No machines registered. Run{" "}
                                            <code>sadmin vanta-setup</code> on your developer machine.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                            {dm.machines.map((m) => (
                                <MachineRow key={m.host_uuid} machine={m} />
                            ))}
                        </TableBody>
                    </Table>
                </>
            )}
        </div>
    );
});
