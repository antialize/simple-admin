import Items from "./deployment/Items";
import Log from "./deployment/Log";

import type { JSX } from "react";
import Buttons from "./deployment/Buttons";
import Header from "./deployment/Header";
import Message from "./deployment/Message";

function Deployment(): JSX.Element {
    return (
        <div className="deployment_container">
            <Header />
            <Message />
            <Items />
            <Log />
            <Buttons />
        </div>
    );
}

export default Deployment;
