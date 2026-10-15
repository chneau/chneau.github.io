import { Alert, Button, Text, TextInput } from "@mantine/core";
import type { InventoryRecord } from "../lib/inventory";
import type { QuantityEdit } from "../lib/staged-edits";

export const QuantityEditor = ({
	record,
	staged,
	displayedQuantity,
	onQuantityChange,
	onStage,
}: {
	record: InventoryRecord;
	staged: QuantityEdit | undefined;
	displayedQuantity: string;
	onQuantityChange: (value: string) => void;
	onStage: () => void;
}) => (
	<>
		<TextInput
			label="Quantity"
			aria-label="New quantity"
			inputMode="numeric"
			value={displayedQuantity}
			onChange={(event) => onQuantityChange(event.currentTarget.value)}
			description={`Quantity in the uploaded save: ${(
				record.originalQuantity ?? record.quantity
			).toLocaleString()}.`}
			ff="monospace"
		/>
		<Button onClick={onStage}>Stage quantity change</Button>
		{staged ? (
			<Alert variant="light" color="brand" p="sm">
				<Text size="xs">
					Staged: {staged.expectedQuantity.toLocaleString()} →{" "}
					{staged.newQuantity.toLocaleString()}. Use{" "}
					<Text span fw={500}>
						Download save
					</Text>{" "}
					at the top to create the new save.
				</Text>
			</Alert>
		) : (
			<Text size="xs" c="dimmed">
				Staging does not touch your original file. The new save is only created
				when you choose Download save.
			</Text>
		)}
	</>
);
