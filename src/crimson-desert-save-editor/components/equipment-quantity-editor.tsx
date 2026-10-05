import { Alert, Button, Text, TextInput } from "@mantine/core";
import type { InventoryRecord } from "@/lib/inventory";
import type { QuantityEdit } from "@/lib/staged-edits";

/**
 * The editor for a stack that has no equipment to refine.
 *
 * Its own component because it is a genuinely different job from the workshop:
 * there are no sockets and no rules, so the workshop would show a reader a form
 * full of controls that do not apply to a stack of arrows.
 */
export const QuantityEditor = ({
	record,
	staged,
	displayedQuantity,
	onQuantityChange,
	onStage,
}: {
	record: InventoryRecord;
	/** The queued quantity change, when the reader has staged one. */
	staged: QuantityEdit | undefined;
	displayedQuantity: string;
	onQuantityChange: (value: string) => void;
	onStage: () => void;
}) => (
	// A fragment, not a `Stack`: the drawer already spaces its children, and a
	// nested stack would put a second gap between these controls.
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
