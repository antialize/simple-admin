import { observer } from "mobx-react";
import state, { CONNECTION_STATUS } from "./state";
import Login from "./Login";
import Menu from "./Menu";
import { MainPage } from "./MainPage";

const App = observer(function Content () {
  let dialog: JSX.Element | null = <>No dialog</>;
  if (state.connectionStatus != CONNECTION_STATUS.INITED) {
      dialog = <Login />;
  }
  if (state.loaded) {
      return <>
        <Menu/>
        <main>
          <MainPage />
        </main>
      </>
  } else {
      return dialog;
  }
});


export default App
