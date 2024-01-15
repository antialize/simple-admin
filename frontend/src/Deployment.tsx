import Items from './deployment/Items'
import Log from './deployment/Log';

import Buttons from "./deployment/Buttons";
import Header from "./deployment/Header";
import Message from "./deployment/Message";

function Deployment() {
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

