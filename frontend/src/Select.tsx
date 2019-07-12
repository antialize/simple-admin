import * as React from "react";
import CancelIcon from '@material-ui/icons/Cancel';
import Chip from "@material-ui/core/Chip";
import CreatableSelect from 'react-select/creatable';
import MenuItem from "@material-ui/core/MenuItem";
import Paper from "@material-ui/core/Paper";
import RSelect from 'react-select';
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { Theme, StyleRules, createStyles, StyledComponentProps, withStyles } from "@material-ui/core/styles";
import { ThemedComponentProps } from "@material-ui/core/styles/withTheme";
import { emphasize } from '@material-ui/core/styles/colorManipulator';
import makeStyles from "@material-ui/styles/makeStyles";
import * as PropTypes from 'prop-types';
import clsx from 'clsx';
import { useTheme } from "@material-ui/styles";
import { StylesConfig } from "react-select/src/styles";


// Code copied from https://material-ui.com/components/autocomplete/

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    flexGrow: 1,
    height: 250,
  },
  input: {
    display: 'flex',
    padding: 0,
    height: 'auto',
  },
  valueContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden',
    minWidth: 300,
  },
  chip: {
    margin: theme.spacing(0.5, 0.25),
  },
  chipFocused: {
    backgroundColor: emphasize(
      theme.palette.type === 'light' ? theme.palette.grey[300] : theme.palette.grey[700],
      0.08,
    ),
  },
  noOptionsMessage: {
    padding: theme.spacing(1, 2),
  },
  singleValue: {
    fontSize: 16,
  },
  placeholder: {
    position: 'absolute',
    left: 2,
    bottom: 6,
    fontSize: 16,
  },
  paper: {
    position: 'absolute',
    zIndex: 1,
    marginTop: theme.spacing(1),
    left: 0,
    right: 0,
  },
  divider: {
    height: theme.spacing(2),
  },
}));

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

NoOptionsMessage.propTypes = {
  children: PropTypes.node,
  innerProps: PropTypes.object,
  selectProps: PropTypes.object.isRequired,
};

function inputComponent({ inputRef, ...props }: any) {
  return <div ref={inputRef} {...props} />;
}

inputComponent.propTypes = {
  inputRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
};

function Control(props: any) {
  const {
    children,
    innerProps,
    innerRef,
    selectProps: { classes, TextFieldProps },
  } = props;

  return (
    <TextField
      fullWidth
      InputProps={{
        inputComponent,
        inputProps: {
          className: classes.input,
          ref: innerRef,
          children,
          ...innerProps,
        },
      }}
      {...TextFieldProps}
    />
  );
}

Control.propTypes = {
  children: PropTypes.node,
  innerProps: PropTypes.object,
  innerRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  selectProps: PropTypes.object.isRequired,
};

function Option(props: any) {
  return (
    <MenuItem
      ref={props.innerRef}
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

Option.propTypes = {
  children: PropTypes.node,
  innerProps: PropTypes.object,
  innerRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  isFocused: PropTypes.bool,
  isSelected: PropTypes.bool,
};

function Placeholder(props: any) {
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

Placeholder.propTypes = {
  children: PropTypes.node,
  innerProps: PropTypes.object,
  selectProps: PropTypes.object.isRequired,
};

function SingleValue(props: any) {
  return (
    <Typography className={props.selectProps.classes.singleValue} {...props.innerProps}>
      {props.children}
    </Typography>
  );
}

SingleValue.propTypes = {
  children: PropTypes.node,
  innerProps: PropTypes.object,
  selectProps: PropTypes.object.isRequired,
};

function ValueContainer(props: any) {
  return <div className={props.selectProps.classes.valueContainer}>{props.children}</div>;
}

ValueContainer.propTypes = {
  children: PropTypes.node,
  selectProps: PropTypes.object.isRequired,
};

function MultiValue(props: any) {
  return (
    <Chip
      tabIndex={-1}
      label={props.children}
      className={clsx(props.selectProps.classes.chip, {
        [props.selectProps.classes.chipFocused]: props.isFocused,
      })}
      onDelete={props.removeProps.onClick}
      deleteIcon={<CancelIcon {...props.removeProps} />}
    />
  );
}

MultiValue.propTypes = {
  children: PropTypes.node,
  isFocused: PropTypes.bool,
  removeProps: PropTypes.object.isRequired,
  selectProps: PropTypes.object.isRequired,
};

function Menu(props: any) {
  return (
    <Paper square className={props.selectProps.classes.paper} {...props.innerProps}>
      {props.children}
    </Paper>
  );
}

Menu.propTypes = {
  children: PropTypes.node,
  innerProps: PropTypes.object,
  selectProps: PropTypes.object,
};

const components = {
  Control,
  Menu,
  MultiValue,
  NoOptionsMessage,
  Option,
  Placeholder,
  SingleValue,
  ValueContainer,
};


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


export default function Select<T>(props: IProps<T>) {
  const classes = useStyles();
  const theme:Theme = useTheme();

  const selectStyles = {
    input: (base:any) => ({
      ...base,
      color: theme.palette.text.primary,
      '& input': {
        font: 'inherit',
      },
    }),
  };

  if (props.create)
    <CreatableSelect
    classes={classes}
      styles={selectStyles}
      options={props.options}
      components={components as any}
      value={props.value}
      isMulti={props.type === 'multi'}
      onChange={(v:any) => {
        props.onChange && props.onChange(v as any)
      }} />;

  return <RSelect
    classes={classes}
    styles={selectStyles}
    options={props.options}
    components={components as any}
    value={props.value}
    isMulti={props.type === 'multi'}
    onChange={(v:any) => {
      props.onChange && props.onChange(v as any)
    }} />;

}
