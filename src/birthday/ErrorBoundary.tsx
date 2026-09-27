import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
	children: ReactNode;
	label?: string;
};

type State = {
	error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Birthday section crashed", error, info);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="tk-error" role="alert">
					<TriangleAlert size={17} strokeWidth={1.9} />
					<div>
						<strong>{this.props.label ?? "This section"}</strong> could not be
						rendered. The rest of the page is still usable.
						<div style={{ opacity: 0.7, marginTop: 4, fontSize: 12 }}>
							{this.state.error.message}
						</div>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
