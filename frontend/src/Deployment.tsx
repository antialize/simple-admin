import Buttons from "./deployment/Buttons";
import Header from "./deployment/Header";
import Items from "./deployment/Items";
import Log from "./deployment/Log";
import Message from "./deployment/Message";

function Deployment(): React.ReactElement {
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
