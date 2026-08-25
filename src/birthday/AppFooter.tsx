import { Layout } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

export const AppFooter = () => {
	const { t } = useTranslation();
	return (
		<Layout.Footer style={{ textAlign: "center" }}>
			{t("app.title")} ©{dayjs().year()}
		</Layout.Footer>
	);
};
