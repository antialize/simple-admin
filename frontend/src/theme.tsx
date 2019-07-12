import { createMuiTheme } from '@material-ui/core/styles';

const theme = createMuiTheme({
    overrides: {
        MuiDialogActions: {
            root: {
                margin: 20
            }
        },
        MuiMenu: {
            paper: {
                minWidth: 250,
            }
        },
        MuiTypography: {
            h4: {
                marginTop: 20,
                margitBottom: 5
            }
        }
    },
    palette: {
        type: "dark"
    },
});

document.body.style.backgroundColor = theme.palette.background.default;

export default theme;
