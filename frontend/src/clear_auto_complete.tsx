import * as React from "react";
import AutoComplete from 'material-ui/AutoComplete';

interface Props<Item> {
    hintText:string,
    dataSource:Item[],
    dataSourceConfig?:{text:string, value:string};
    onNewRequest?: (item:Item) => void; 
}

interface State {
    value: string;
}

export class ClearAutoComplete extends React.Component<Props<any>, State> {
    state: State;

    constructor(props:Props<any>) {
        super(props);
        this.state = {value:""};
    }

    render() {
        return <AutoComplete
                    filter={AutoComplete.caseInsensitiveFilter}
                    searchText={this.state.value}
                    onUpdateInput={v=>this.setState({value: v})}
                    hintText={this.props.hintText}
                    dataSource={this.props.dataSource}
                    dataSourceConfig={this.props.dataSourceConfig}
                    onNewRequest={(item:any)=>{this.props.onNewRequest(item); this.setState({value:""});}}
                    />
    }
}