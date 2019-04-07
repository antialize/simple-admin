import * as React from "react";
import Buttons from './deployment/Buttons';
import Header from './deployment/Header';
import Items from './deployment/Items'
import Log from './deployment/Log';
import Message from './deployment/Messages';

function Deployment(props:{}) {
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

