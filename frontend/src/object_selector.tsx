import * as React from "react";
import Chip from 'material-ui/Chip';
import AutoComplete from 'material-ui/AutoComplete';

export function ObjectSelector({name: name}: {name:string}) {
    let chipData = [
      {key: 0, label: 'Angular'},
      {key: 1, label: 'JQuery'},
      {key: 2, label: 'Polymer'},
      {key: 3, label: 'ReactJS'},
      {key: 4, label: 'ReactJS'},
      {key: 5, label: 'ReactJS'},
      {key: 6, label: 'ReactJS'},
      {key: 7, label: 'ReactJS'},
      {key: 8, label: 'ReactJS'},
      {key: 9, label: 'ReactJS'},
    ];
    return (
        <div>
            <div style={{display: 'flex', flexWrap: 'wrap'}}>
                {chipData.map((o)=>{
                    return <Chip key={o.key} style={{margin:4}} onRequestDelete={()=>{console.log("Delete")}}>{o.label}</Chip>
                })}
            </div>
            Add: <AutoComplete
                hintText="Type anything"
                dataSource={['freek', 'jakobt', 'thomasm', 'jungwoo']}
                onNewRequest={()=>{console.log("cookie")}}
                />
        </div>
    )
}