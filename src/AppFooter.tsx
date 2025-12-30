import { Layout } from "antd";

export const AppFooter = () => (
	<Layout.Footer style={{ textAlign: "center" }}>
		Birthday Tracker ©{new Date().getFullYear()}
	</Layout.Footer>
);
