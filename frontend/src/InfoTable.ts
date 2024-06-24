import { styled } from "@mui/material/styles";

export const InfoTable = styled("table")(
    ({ theme }) => `
    border-collapse: collapse;
    border-width: 1px;
    border-color: ${theme.palette.background.default};
    border-style: solid;
    width: 100%;
    th {
        color: ${theme.palette.text.primary};
        border-width: 1px;
        border-color: ${theme.palette.background.default};
        background-color: ${theme.palette.background.paper};
    }
    tr {
        border-width: 1px;
        border-color: ${theme.palette.background.default};
        border-style: solid;
        color: ${theme.palette.text.primary};
        background-color: ${theme.palette.background.default};
    }
    tr.disabled {
        color: ${theme.palette.text.disabled},
    }
    td {
        border-width: 1px;
        border-color: ${theme.palette.background.default};
        border-style: solid;
        padding: 4px;
    }
    tr:nth-child(even) {
        background-color: ${theme.palette.background.paper};
    }
`,
);

export const InfoTableHeader = styled("th")(
    ({ theme }) => `
    background-color: ${theme.palette.primary.main} !important;
    border-style: solid;
    font-size: 21pt;
    padding: 8px;
    text-align: left;
`,
);

export default InfoTable;
