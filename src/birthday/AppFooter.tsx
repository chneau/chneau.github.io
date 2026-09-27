import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { Footer } from "../shared";

export const AppFooter = () => {
	const { t } = useTranslation();
	return (
		<Footer
			left={
				<>
					{t("app.title")} · {dayjs().year()}
				</>
			}
			right={
				<a
					href="https://github.com/chneau/chneau.github.io"
					target="_blank"
					rel="noreferrer"
				>
					{t("app.header.github")}
				</a>
			}
		/>
	);
};
