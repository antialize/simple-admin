import { Theme, StyleRules, createStyles } from "@material-ui/core/styles";

const styles = (theme:Theme) : StyleRules => {
    return createStyles({
        infoTable: {
            borderCollapse: 'collapse',
            borderWidth: 1,
            borderColor: theme.palette.background.default,
            borderStyle: 'solid',
            width: '100%',
            '& th' :{
                color: theme.palette.text.primary,
                borderWidth: 1,
                borderColor: theme.palette.background.default,
                borderStyle: 'solid',
            },
            "& tr" : {
                borderWidth: 1,
                borderColor: theme.palette.background.default,
                borderStyle: 'solid',
                color: theme.palette.text.primary,
                backgroundColor: theme.palette.background.paper,
            },
            "& tr.disabled" : {
                color: theme.palette.text.disabled,
            },
            "& td" : {
                borderWidth: 1,
                borderColor: theme.palette.background.default,
                borderStyle: 'solid',
                padding: 4
            },
            '& tr:nth-child(even)': {
                backgroundColor: theme.palette.background.default,
            },
        },
        infoTableHeader: {
            fontSize: 25,
            padding: 8,
            backgroundColor: theme.palette.primary.main
        }
    });
};

export default styles;