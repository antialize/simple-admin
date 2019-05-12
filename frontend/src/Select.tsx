import * as React from "react";
import CancelIcon from '@material-ui/icons/Cancel';
import Chip from "@material-ui/core/Chip";
import CreatableSelect from 'react-select/lib/Creatable';
import MenuItem from "@material-ui/core/MenuItem";
import Paper from "@material-ui/core/Paper";
import RSelect from 'react-select';
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import classNames from 'classnames';
import { Theme, StyleRules, createStyles, StyledComponentProps, withStyles } from "@material-ui/core/styles";
import { ThemedComponentProps } from "@material-ui/core/styles/withTheme";
import { emphasize } from '@material-ui/core/styles/colorManipulator';
import nullCheck from '../../shared/nullCheck';

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
  
  function Control(fullWidth?:boolean) {
    return (props:any) => {
        return (
        <TextField
            fullWidth={fullWidth}
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

interface Item<T> {
    label: string;
    value: T;
}

interface IMultiProps<T> {
    type: 'multi';
    placeholder?: string;
    options: Item<T>[];
    value: Item<T>[];
    create?: boolean;
    fullWidth?: boolean;
    onChange?: (value: Item<T>[]) => void;
}

interface ISingleProps<T> {
    type: 'single';
    placeholder?: string;
    options: Item<T>[];
    value: Item<T> | null;
    create?: boolean;
    fullWidth?: boolean;
    onChange?: (value: Item<T> | null) => void;
}

type IProps<T> = (IMultiProps<T> | ISingleProps<T>) & StyledComponentProps & ThemedComponentProps;

function selectInner<T>(props: IProps<T>) {
    const selectStyles = {
      input: (base:any) => {
          return ({
              ...base,
              color: nullCheck(props.theme).palette.text.primary,
              '& input': {

                  font: 'inherit',
              },
          });
      },
    };

    if (props.create)
    return <CreatableSelect
        classes={props.classes}
        styles={selectStyles}
        components={{Control:Control(props.fullWidth),
            Menu,
            MultiValue,
            NoOptionsMessage,
            Option,
            Placeholder,
            SingleValue,
            ValueContainer,}}
        placeholder={props.placeholder}
        isMulti={props.type == 'multi'}
        options={props.options}
        isClearable={false}
        value={props.value}
        onChange={(v) => {
            props.onChange && props.onChange(v as any)
        }} />;

    return <RSelect
    classes={props.classes}
    styles={selectStyles}
    components={{Control:Control(props.fullWidth),
        Menu,
        MultiValue,
        NoOptionsMessage,
        Option,
        Placeholder,
        SingleValue,
        ValueContainer,}}
    placeholder={props.placeholder}
    isMulti={props.type === 'multi'}
    options={props.options}
    isClearable={false}
    value={props.value}
    onChange={(v) => {
        props.onChange && props.onChange(v as any)
    }} />;
}

export const Select = withStyles(styles, {withTheme: true})(
  function SelectImpl(props: IProps<string>) {
    return selectInner<string>(props);
  });

export const NumberSelect = withStyles(styles, {withTheme: true})(
  function NumberSelectImpl(props: IProps<number>) {
    return selectInner<number>(props);
  });

export default Select;
