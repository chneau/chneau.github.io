import { useMediaQuery } from "@mantine/hooks";
import { MoreHorizontal } from "lucide-react";
import {
	Children,
	isValidElement,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { useRovingFocus } from "../hooks/useRovingFocus";

export const HeaderOverflow = ({ children }: { children: React.ReactNode }) => {
	const isNarrow = useMediaQuery("(max-width: 1100px)", undefined, {
		getInitialValueInEffect: false,
	});
	const [open, setOpen] = useState(false);
	const container = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLFieldSetElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!isNarrow) setOpen(false);
	}, [isNarrow]);

	const close = (restoreFocus = false) => {
		setOpen(false);
		if (restoreFocus) trigger.current?.focus();
	};

	const { focusFirst, onKeyDown } = useRovingFocus({ menuRef: menu, close });

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!container.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open]);

	useEffect(() => {
		if (open) focusFirst();
	}, [open, focusFirst]);

	if (isNarrow === false) {
		return <>{children}</>;
	}

	const items = Children.map(children, (child) =>
		isValidElement(child) ? (
			<div role="none" className="app-header-overflow__row">
				{child}
			</div>
		) : (
			child
		),
	);

	return (
		<div className="app-header-overflow" ref={container}>
			<button
				ref={trigger}
				type="button"
				className="app-header-action app-header-action--icon app-header-overflow__trigger"
				aria-label="More actions"
				title="More actions"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((value) => !value)}
			>
				<MoreHorizontal size={16} aria-hidden="true" />
			</button>
			{open ? (
				<fieldset
					ref={menu}
					id={menuId}
					className="app-switcher__menu app-header-overflow__menu"
					onKeyDown={onKeyDown}
				>
					<legend className="sr-only">More actions</legend>
					{items}
				</fieldset>
			) : null}
		</div>
	);
};
