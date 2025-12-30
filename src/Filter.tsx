import { Button, Input, Space } from "antd";
import { useSnapshot } from "valtio";
import { store } from "./store";

export const FilterButtons = () => {
	const snap = useSnapshot(store);
	return (
		<Space>
			<Button
				size="small"
				type={snap.showBoys ? "primary" : "default"}
				onClick={() => {
					store.showBoys = !store.showBoys;
				}}
			>
				Boys ♂️
			</Button>
			<Button
				size="small"
				type={snap.showGirls ? "primary" : "default"}
				onClick={() => {
					store.showGirls = !store.showGirls;
				}}
			>
				Girls ♀️
			</Button>
			<Button
				size="small"
				type={snap.showWeddings ? "primary" : "default"}
				onClick={() => {
					store.showWeddings = !store.showWeddings;
				}}
			>
				Weddings 💒
			</Button>
		</Space>
	);
};

export const FilterSearch = () => {
	const snap = useSnapshot(store);
	return (
		<Input.Search
			placeholder="Search..."
			allowClear
			style={{ marginBottom: 16 }}
			onChange={(e) => {
				store.search = e.target.value;
			}}
			value={snap.search}
		/>
	);
};
