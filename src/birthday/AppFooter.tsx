import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

export const AppFooter = () => {
	const { t } = useTranslation();
	return (
		<footer className="tk-footer">
			<div className="tk-container tk-footer__inner">
				<span>
					{t("app.title")} · {dayjs().year()}
				</span>
				<span style={{ display: "inline-flex", gap: 14 }}>
					<a
						href="https://github.com/chneau/chneau.github.io"
						target="_blank"
						rel="noreferrer"
					>
						{t("app.header.github")}
					</a>
				</span>
			</div>
		</footer>
	);
};
