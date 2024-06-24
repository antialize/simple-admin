import SearchIcon from "@mui/icons-material/Search";
import {
    AppBar,
    Badge,
    Button,
    ClickAwayListener,
    IconButton,
    InputBase,
    Link,
    List,
    ListItem,
    Paper,
    Popper,
    Toolbar,
    Typography,
    useTheme,
} from "@mui/material";
import { observer } from "mobx-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import DisplayError from "./Error";
import MenuDropdown, { DropDownItem } from "./MenuDropdown";
import SubMenu from "./SubMenu";
import { ObjectMenuList } from "./TypeMenuItems";
import derivedState from "./derivedState";
import * as State from "./shared/state";
import { rootId, rootInstanceId } from "./shared/type";
import state from "./state";

function matchText(text: string, key: string) {
    if (!key || key.length === 0) return false;
    let ki = 0;
    for (let i = 0; i < text.length; ++i) {
        if (text[i] !== key[ki]) continue;
        ++ki;
        if (ki === key.length) return true;
    }
    return false;
}

function MatchedText({
    search,
    text,
    primary,
}: { search: string; text: string; primary: boolean }) {
    const ans = [];
    let ki = 0;
    let j = 0;
    const textLc = text.toLowerCase();
    for (let i = 0; i < text.length; ) {
        if (textLc[i] === search[ki]) {
            if (j !== i) ans.push(text.slice(j, i));
            j = i;
            while (i < text.length && ki < search.length && textLc[i] === search[ki]) {
                ++i;
                ++ki;
            }
            ans.push(<span style={{ color: primary ? "green" : "red" }}>{text.slice(j, i)}</span>);
            j = i;
        } else {
            ++i;
        }
    }
    if (j !== text.length) ans.push(text.slice(j));

    return <>{ans}</>;
}

const TypeObjects = observer(function TypeObjects({
    search,
    type,
    clearSearch,
    goto,
}: {
    search: string;
    type: number;
    clearSearch: () => void;
    goto: number | null;
}) {
    const ans = [];
    const digests = state.objectDigests.get(type);
    if (!digests) return <DisplayError>Missing digests</DisplayError>;
    const page = state.page;
    if (page === null) return <DisplayError>Missing state.page</DisplayError>;
    for (const [id, p] of digests) {
        if (p.name === null || !matchText(p.name, search)) continue;
        ans.push(
            <ListItem>
                <Link
                    color={"textPrimary" as any}
                    href={page.link({ type: State.PAGE_TYPE.Object, objectType: type, id })}
                    onClick={(e: any) => {
                        clearSearch();
                        page.onClick(e, {
                            type: State.PAGE_TYPE.Object,
                            objectType: type,
                            id,
                        });
                    }}
                >
                    <MatchedText search={search} text={p.name} primary={goto === id} />
                </Link>
            </ListItem>,
        );
    }
    if (ans.length === 0) return <> </>;
    const t = state.types.get(type);
    return (
        <>
            <Typography variant="h4">Type {t ? t.name : "??"}</Typography>
            <List>{ans}</List>
        </>
    );
});

let searchInput: HTMLInputElement | null = null;
function Search() {
    const [key, setKey] = useState("");
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const theme = useTheme();
    useHotkeys(
        ["/", "s"],
        () => {
            searchInput?.focus();
            setKey("");
        },
        { preventDefault: true },
    );
    useHotkeys(
        ["esc"],
        () => {
            setKey("");
            searchInput?.blur();
        },
        { enabled: key !== "", enableOnContentEditable: true, enableOnFormTags: true },
    );

    const page = state.page;
    if (!page) return <DisplayError>Missing state.page</DisplayError>;

    const typeFind = [];
    let goto: [number, number] | null = null;

    useHotkeys(
        ["return"],
        () => {
            if (goto && searchInput) {
                page.set({ type: State.PAGE_TYPE.Object, objectType: goto[0], id: goto[1] });
                setKey("");
                searchInput.blur();
            }
        },
        { enabled: key !== "", enableOnContentEditable: true, enableOnFormTags: true },
    );

    const keyLc = key.toLowerCase();
    if (keyLc !== "") {
        for (const [type, members] of state.objectDigests) {
            for (const [id, p] of members) {
                if (p.name == null) continue;
                if (
                    p.name.toLowerCase() !== keyLc.toLowerCase() &&
                    (goto ?? !matchText(p.name, keyLc))
                )
                    continue;
                goto = [type, id];
            }
        }

        for (const [type, _] of state.objectDigests) {
            typeFind.push(
                <TypeObjects
                    search={keyLc}
                    type={type}
                    clearSearch={() => {
                        setKey("");
                    }}
                    goto={goto != null && goto[0] === type ? goto[1] : null}
                />,
            );
        }
    }

    return (
        <div
            ref={(e) => {
                setAnchor(e);
            }}
            style={{
                paddingLeft: 10,
                backgroundColor: theme.palette.primary.light,
                borderRadius: theme.shape.borderRadius,
            }}
        >
            <InputBase
                color="error"
                inputRef={(e) => {
                    searchInput = e;
                }}
                placeholder="Search"
                value={key}
                onChange={(e) => {
                    setKey(e.target.value);
                }}
            />
            <IconButton
                aria-label="Search"
                onClick={() => {
                    searchInput?.focus();
                    searchInput?.select();
                }}
            >
                <SearchIcon />
            </IconButton>
            <Popper
                open={key !== ""}
                anchorEl={anchor}
                placement="bottom-end"
                style={{ zIndex: 99999 }}
            >
                <ClickAwayListener
                    onClickAway={() => {
                        setKey("");
                    }}
                >
                    <Paper
                        style={{ padding: 10, minWidth: 350, maxHeight: 1000, overflowY: "auto" }}
                    >
                        <Typography variant="h5" style={{ marginBottom: 10 }}>
                            Search results
                        </Typography>
                        {typeFind}
                    </Paper>
                </ClickAwayListener>
            </Popper>
        </div>
    );
}

const Menu = observer(function Menu() {
    const page = state.page;
    if (!page) return <DisplayError>Missing state.page</DisplayError>;
    const login = state.login;
    if (!login) return <DisplayError>Missing state.login</DisplayError>;
    const types = derivedState.menuTypes;
    useHotkeys("d", () => {
        page.set({ type: State.PAGE_TYPE.Dashbord });
    });
    useHotkeys("i", () => {
        page.set({ type: State.PAGE_TYPE.DockerImages });
    });
    useHotkeys("c", () => {
        page.set({ type: State.PAGE_TYPE.DockerContainers });
    });
    return (
        <AppBar color="primary" enableColorOnDark>
            <Toolbar>
                <>
                    <MenuDropdown hotkey="m">
                        {types.map((t) =>
                            t.id === rootId ? (
                                <DropDownItem
                                    key={rootInstanceId}
                                    onClick={(e) => {
                                        page.onClick(e, {
                                            type: State.PAGE_TYPE.Object,
                                            objectType: rootId,
                                            id: rootInstanceId,
                                        });
                                    }}
                                    href={page.link({
                                        type: State.PAGE_TYPE.Object,
                                        objectType: rootId,
                                        id: rootInstanceId,
                                    })}
                                >
                                    Root
                                </DropDownItem>
                            ) : (
                                <SubMenu title={t.name} key={t.name}>
                                    {" "}
                                    <ObjectMenuList type={t.id} />{" "}
                                </SubMenu>
                            ),
                        )}
                    </MenuDropdown>
                    <Badge color="secondary" badgeContent={state.activeMessages}>
                        <Button
                            color="inherit"
                            onClick={(e) => {
                                page.onClick(e, { type: State.PAGE_TYPE.Dashbord });
                            }}
                            href={page.link({ type: State.PAGE_TYPE.Dashbord })}
                        >
                            Dashbord
                        </Button>
                    </Badge>
                    <Button
                        color="inherit"
                        onClick={(e) => {
                            page.onClick(e, { type: State.PAGE_TYPE.Deployment });
                        }}
                        href={page.link({ type: State.PAGE_TYPE.Deployment })}
                    >
                        Deployment
                    </Button>
                    <div style={{ width: "10px" }} />
                    <Button
                        color="inherit"
                        onClick={(e) => {
                            page.onClick(e, { type: State.PAGE_TYPE.DockerImages });
                        }}
                        href={page.link({ type: State.PAGE_TYPE.DockerImages })}
                    >
                        Images
                    </Button>
                    <Button
                        color="inherit"
                        onClick={(e) => {
                            page.onClick(e, { type: State.PAGE_TYPE.DockerContainers });
                        }}
                        href={page.link({ type: State.PAGE_TYPE.DockerContainers })}
                    >
                        Containers
                    </Button>
                    <Button
                        color="inherit"
                        onClick={(e) => {
                            page.onClick(e, { type: State.PAGE_TYPE.ModifiedFiles });
                        }}
                        href={page.link({ type: State.PAGE_TYPE.ModifiedFiles })}
                    >
                        Modified Files
                    </Button>
                    <Button
                        color="inherit"
                        onClick={(e) => {
                            page.onClick(e, { type: State.PAGE_TYPE.Search });
                        }}
                        href={page.link({ type: State.PAGE_TYPE.Search })}
                    >
                        Search
                    </Button>
                    <div style={{ flexGrow: 1 }} />
                    <Search />
                    <div style={{ width: "10px" }} />
                    <Button
                        color="inherit"
                        onClick={() => {
                            login.logout(false);
                        }}
                    >
                        Logout
                    </Button>
                    <Button
                        color="inherit"
                        onClick={() => {
                            login.logout(true);
                        }}
                    >
                        Full logout
                    </Button>
                </>
            </Toolbar>
        </AppBar>
    );
});

export default Menu;
