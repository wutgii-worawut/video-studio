import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as ContextPrimitive from '@radix-ui/react-context-menu';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {X} from 'lucide-react';
import {cva,type VariantProps} from 'class-variance-authority';
import {cn} from '../lib/utils';

export const buttonVariants=cva('ui-button', {variants:{
  variant:{default:'button-primary',secondary:'button-secondary',ghost:'button-ghost',outline:'button-outline',destructive:'button-danger'},
  size:{default:'button-default',sm:'button-sm',lg:'button-lg',icon:'button-icon'}
},defaultVariants:{variant:'default',size:'default'}});
export type ButtonProps=React.ButtonHTMLAttributes<HTMLButtonElement>&VariantProps<typeof buttonVariants>;
export const Button=React.forwardRef<HTMLButtonElement,ButtonProps>(({className,variant,size,...props},ref)=><button ref={ref} className={cn(buttonVariants({variant,size}),className)} {...props}/>);
Button.displayName='Button';
export const Input=React.forwardRef<HTMLInputElement,React.InputHTMLAttributes<HTMLInputElement>>(({className,...props},ref)=><input ref={ref} className={cn('ui-input',className)} {...props}/>);
Input.displayName='Input';
export const Textarea=React.forwardRef<HTMLTextAreaElement,React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({className,...props},ref)=><textarea ref={ref} className={cn('ui-input ui-textarea',className)} {...props}/>);
Textarea.displayName='Textarea';
export function Badge({children,className}:{children:React.ReactNode;className?:string}){return <span className={cn('ui-badge',className)}>{children}</span>}
export const Dialog=DialogPrimitive.Root;
export const DialogTrigger=DialogPrimitive.Trigger;
export const DialogClose=DialogPrimitive.Close;
export const DialogTitle=DialogPrimitive.Title;
export const DialogDescription=DialogPrimitive.Description;
export function DialogContent({children,className,...props}:React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>){
 return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="ui-overlay"/><DialogPrimitive.Content className={cn('ui-dialog',className)} {...props}>{children}<DialogPrimitive.Close className="ui-dialog-close" aria-label="Close dialog"><X size={17}/></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
export const AlertDialog=AlertPrimitive.Root;
export const AlertDialogTitle=AlertPrimitive.Title;
export const AlertDialogDescription=AlertPrimitive.Description;
export const AlertDialogCancel=AlertPrimitive.Cancel;
export const AlertDialogAction=AlertPrimitive.Action;
export function AlertDialogContent({children,className}:React.ComponentPropsWithoutRef<typeof AlertPrimitive.Content>){
 return <AlertPrimitive.Portal><AlertPrimitive.Overlay className="ui-overlay"/><AlertPrimitive.Content className={cn('ui-dialog',className)}>{children}</AlertPrimitive.Content></AlertPrimitive.Portal>;
}
export const DropdownMenu=MenuPrimitive.Root;
export const DropdownMenuTrigger=MenuPrimitive.Trigger;
export const DropdownMenuSeparator=MenuPrimitive.Separator;
export function DropdownMenuContent({children,align='end',...props}:React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>){
 return <MenuPrimitive.Portal><MenuPrimitive.Content align={align} sideOffset={6} className="ui-menu" {...props}>{children}</MenuPrimitive.Content></MenuPrimitive.Portal>;
}
export function DropdownMenuItem({className,...props}:React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>){
 return <MenuPrimitive.Item className={cn('ui-menu-item',className)} {...props}/>;
}
export const TooltipProvider=TooltipPrimitive.Provider;
export const Tooltip=TooltipPrimitive.Root;
export const TooltipTrigger=TooltipPrimitive.Trigger;
export function TooltipContent({children,...props}:React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>){
 return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={7} className="ui-tooltip" {...props}>{children}<TooltipPrimitive.Arrow className="ui-tooltip-arrow"/></TooltipPrimitive.Content></TooltipPrimitive.Portal>;
}
export function DialogFooter({children}:{children:React.ReactNode}){return <div className="ui-dialog-footer">{children}</div>}

export const ContextMenu=ContextPrimitive.Root;
export const ContextMenuTrigger=ContextPrimitive.Trigger;
export function ContextMenuContent({children,...props}:React.ComponentPropsWithoutRef<typeof ContextPrimitive.Content>){
 return <ContextPrimitive.Portal><ContextPrimitive.Content className="ui-menu" {...props}>{children}</ContextPrimitive.Content></ContextPrimitive.Portal>;
}
export function ContextMenuItem({className,...props}:React.ComponentPropsWithoutRef<typeof ContextPrimitive.Item>){
 return <ContextPrimitive.Item className={cn('ui-menu-item',className)} {...props}/>;
}
export const ContextMenuSeparator=ContextPrimitive.Separator;
