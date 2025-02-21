import { observer } from "mobx-react";
import type { JSX } from "react";
import Login from "./Login";
import { MainPage } from "./MainPage";
import Menu from "./Menu";
import state, { CONNECTION_STATUS } from "./state";

const App = observer(function Content() {
    let dialog: JSX.Element | null = <>No dialog</>;
    if (state.connectionStatus !== CONNECTION_STATUS.INITED) {
        dialog = <Login />;
    }
    if (state.loaded) {
        return (
            <>
                <Menu />
                <main>
                    <MainPage />
                </main>
            </>
        );
    }
    return dialog;
});

export default App;
