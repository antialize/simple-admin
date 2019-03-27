import { Theme, StyleRules, createStyles, StyledComponentProps, withStyles, jssPreset } from "@material-ui/core/styles";
import React = require("react");
import RSelect from 'react-select';
import Typography from "@material-ui/core/Typography";
import TextField from "@material-ui/core/TextField";
import MenuItem from "@material-ui/core/MenuItem";
import Chip from "@material-ui/core/Chip";
import classNames from 'classnames';
import CancelIcon from '@material-ui/icons/Cancel';
import Paper from "@material-ui/core/Paper";
import { emphasize } from '@material-ui/core/styles/colorManipulator';
import { ThemedComponentProps } from "@material-ui/core/styles/withTheme";

function NoOptionsMessage(props:any) {
    return (
      <Typography
        color="textSecondary"
        className={props.selectProps.classes.noOptionsMessage}
        {...props.innerProps}
      >
        {props.children}
      </Typography>
    );
  }
  
  function inputComponent({ inputRef, ...props }: any) {
    return <div ref={inputRef} {...props} />;
  }
  
  function Control(props:any) {
    return (
      <TextField
        fullWidth
        InputProps={{
          inputComponent,
          inputProps: {
            className: props.selectProps.classes.input,
            inputRef: props.innerRef,
            children: props.children,
            ...props.innerProps,
          },
        }}
        {...props.selectProps.textFieldProps}
      />
    );
  }
  
  function Option(props:any) {
    return (
      <MenuItem
        buttonRef={props.innerRef}
        selected={props.isFocused}
        component="div"
        style={{
          fontWeight: props.isSelected ? 500 : 400,
        }}
        {...props.innerProps}
      >
        {props.children}
      </MenuItem>
    );
  }
  
  function Placeholder(props:any) {
    return (
      <Typography
        color="textSecondary"
        className={props.selectProps.classes.placeholder}
        {...props.innerProps}
      >
        {props.children}
      </Typography>
    );
  }
  
  function SingleValue(props:any) {
    return (
      <Typography className={props.selectProps.classes.singleValue} {...props.innerProps}>
        {props.children}
      </Typography>
    );
  }
  
  function ValueContainer(props:any) {
    return <div className={props.selectProps.classes.valueContainer}>{props.children}</div>;
  }
  
  function MultiValue(props:any) {
    return (
      <Chip
        tabIndex={-1}
        label={props.children}
        className={classNames(props.selectProps.classes.chip, {
          [props.selectProps.classes.chipFocused]: props.isFocused,
        })}
        onDelete={props.removeProps.onClick}
        deleteIcon={<CancelIcon {...props.removeProps} />}
      />
    );
  }
  
  function Menu(props:any) {
    return (
      <Paper square className={props.selectProps.classes.paper} {...props.innerProps}>
        {props.children}
      </Paper>
    );
  }
  

const styles = (theme:Theme) : StyleRules => {
    return createStyles({
        root: {
            flexGrow: 1,
                height: 250,
            },
            input: {
                display: 'flex',
                padding: 0,
            },
            valueContainer: {
                display: 'flex',
                flexWrap: 'wrap',
                flex: 1,
                alignItems: 'center',
                overflow: 'hidden',
            },
            chip: {
                margin: `${theme.spacing.unit / 2}px ${theme.spacing.unit / 4}px`,
            },
            chipFocused: {
                backgroundColor: emphasize(
                    theme.palette.type === 'light' ? theme.palette.grey[300] : theme.palette.grey[700],
                    0.08,
                ),
            },
            noOptionsMessage: {
                padding: `${theme.spacing.unit}px ${theme.spacing.unit * 2}px`,
            },
            singleValue: {
                fontSize: 16,
            },
            placeholder: {
                position: 'absolute',
                left: 2,
                fontSize: 16,
            },
            paper: {
                position: 'absolute',
                zIndex: 1,
                marginTop: theme.spacing.unit,
                left: 0,
                right: 0,
            },
            divider: {
                height: theme.spacing.unit * 2,
            },
    });
}

interface Item {
    label:string;
    value: number;
}
interface IProps {
    isMulti?: boolean;
    placeholder?: string;
    options: Item[];
    value: Item | Item[];
    onChange?: (value: Item | Item[]) => void;
}

function SelectImpl(props: IProps & StyledComponentProps & ThemedComponentProps) {
    const selectStyles = {
        input: (base:any) => {
            return ({
                ...base,
                color: props.theme.palette.text.primary,
                '& input': {
                    font: 'inherit',
                },
            });
        },
      };

    return <RSelect
        classes={props.classes}
        styles={selectStyles}
        components={{Control,
            Menu,
            MultiValue,
            NoOptionsMessage,
            Option,
            Placeholder,
            SingleValue,
            ValueContainer,}}
        placeholder={props.placeholder}
        isMulti={props.isMulti}
        options={props.options}
        isClearable={false}
        value={props.value}
        onChange={(v) => {
            console.log("On change", v);
            props.onChange(v)
        }}
    />;
}

const Select = withStyles(styles, {withTheme: true})(SelectImpl);

export default Select;