import { RotateCcw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Props = {
	children: ReactNode;
	label?: string;
};

type State = {
	error: Error | null;
};

type FallbackProps = {
	/** Already translated by the caller; falls back to a generic section name. */
	label?: string;
	message: string;
	onRetry: () => void;
};

const ErrorFallback = ({ label, message, onRetry }: FallbackProps) => {
	const { t } = useTranslation();
	return (
		<div className="tk-error" role="alert">
			<TriangleAlert size={17} strokeWidth={1.9} />
			<div style={{ flex: 1 }}>
				<strong>{label ?? t("app.error.section")}</strong>{" "}
				{t("app.error.could_not_render")}
				<div style={{ opacity: 0.7, marginTop: 4, fontSize: 12 }}>
					{message}
				</div>
				<button
					type="button"
					className="tk-iconbtn"
					style={{ marginTop: 8 }}
					onClick={onRetry}
				>
					<RotateCcw size={14} strokeWidth={1.9} />
					{t("app.error.reload_section")}
				</button>
			</div>
		</div>
	);
};

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Birthday section crashed", error, info);
	}

	handleRetry = () => {
		this.setState({ error: null });
	};

	render() {
		const error = this.state.error;
		if (error) {
			return (
				<ErrorFallback
					label={this.props.label}
					message={error.message}
					onRetry={this.handleRetry}
				/>
			);
		}
		return this.props.children;
	}
}
