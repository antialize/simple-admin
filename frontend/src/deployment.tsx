import * as React from "react";
import Buttons from './deployment/buttons';
import Header from './deployment/header';
import Message from './deployment/message'
import Items from './deployment/items'
import Log from './deployment/log';

export function Deployment(props:{}) {
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

