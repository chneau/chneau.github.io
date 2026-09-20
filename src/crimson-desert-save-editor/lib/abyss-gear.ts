export type AbyssGearCatalogItem = {
	name: string;
	legacy_internal_name_hint?: string;
	description?: string;
};

type AbyssGearOption = AbyssGearCatalogItem & { effect: string };

type AbyssGearRules = {
	equipmentTypes: Record<string, number>;
	gear: Record<
		string,
		{ allowedEquipTypes: number[]; allowedCategories: string[] }
	>;
};

export const canSocketGear = (
	rules: AbyssGearRules,
	equipmentKey: number,
	gearKey: number | string,
): boolean => {
	const equipmentType = rules.equipmentTypes[String(equipmentKey)];
	return (
		equipmentType !== undefined &&
		(rules.gear[String(gearKey)]?.allowedEquipTypes.includes(equipmentType) ??
			false)
	);
};

export const gearCompatibilityLabel = (
	rules: AbyssGearRules,
	gearKey: number | string,
): string => {
	const categories = rules.gear[String(gearKey)]?.allowedCategories;
	return categories?.length
		? `Fits: ${categories.join(", ")}`
		: "Compatibility unavailable.";
};

const plainText = (value: string): string => {
	return value
		.replace(/\{Staticinfo:[^{}#]+#([^{}]+)\}/gi, "$1")
		.replace(/<br\s*\/?\s*>/gi, "\n")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'");
};

const effectText = (description = ""): string => {
	const text = plainText(description);
	const marker = text.indexOf("[Effect]");
	const effect =
		marker >= 0
			? text.slice(marker + "[Effect]".length)
			: text.startsWith("Grants a variety of effects")
				? text
						.split(/\n\s*\n/)
						.slice(1)
						.join(" ")
				: "";
	return effect
		.replace(/^[^:\n]+:\s*/, "")
		.replace(/\s+/g, " ")
		.trim();
};

export const abyssGearOptions = (
	items: Record<string, AbyssGearCatalogItem>,
): [string, AbyssGearOption][] => {
	const byInternalName = new Map(
		Object.values(items).map((item) => [item.legacy_internal_name_hint, item]),
	);
	return (
		Object.entries(items)
			// Blueprints and unidentified gear belong in Add Item, not in an equipment socket.
			.filter(([, item]) =>
				/^Item_(Stat|Skill)_AbyssGear_/i.test(
					item.legacy_internal_name_hint ?? "",
				),
			)
			.map(([key, item]): [string, AbyssGearOption] => {
				const internalName = item.legacy_internal_name_hint ?? "";
				let effect =
					effectText(item.description) ||
					effectText(byInternalName.get(`Recipe_${internalName}`)?.description);
				if (!effect) {
					const familyName = internalName.replace(/_(LV\d+|Special)$/i, "_LV1");
					const familyEffect =
						effectText(byInternalName.get(familyName)?.description) ||
						effectText(byInternalName.get(`Recipe_${familyName}`)?.description);
					// A level-one numerical bonus must never be presented as a higher tier's bonus.
					if (/\d/.test(familyEffect)) {
						const levelBonus = familyEffect.match(/^(.+? Level)\s*\+\d+\.?$/i);
						effect = levelBonus
							? `Increases ${
									levelBonus[1]
								}. Exact bonus for this tier is unavailable.`
							: "";
					} else {
						effect = familyEffect;
					}
				}
				return [
					key,
					{
						...item,
						effect: effect || "Effect description unavailable.",
					},
				];
			})
			.sort(([, a], [, b]) => a.name.localeCompare(b.name))
	);
};
