import { Button } from "@mantine/core";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "../shared";

type Props = {
	children: ReactNode;
	title: string;
	heading?: ReactNode;
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
		console.error("CV section crashed", error, info);
	}

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return (
			<ErrorState
				className="cv-shell"
				label={this.props.heading}
				title={this.props.title}
				body={error.message}
				action={
					<Button
						variant="default"
						size="sm"
						onClick={() => this.setState({ error: null })}
					>
						Try again
					</Button>
				}
			/>
		);
	}
}
