import { Layout } from "antd";
import { useTranslation } from "react-i18next";

export const AppFooter = () => {
	const { t } = useTranslation();
	return (
		<Layout.Footer style={{ textAlign: "center" }}>
			{t("app.title")} ©{new Date().getFullYear()}
		</Layout.Footer>
	);
};
