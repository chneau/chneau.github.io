# Agent Instructions

To ensure high-quality, maintainable, and type-safe code, all agents working on
this project must adhere to the following strict TypeScript typing rules.

## 🛡️ Strict Typing Rules

1. **No `any`**: Never use the `any` type. If a type is unknown, use `unknown`
   and implement proper type guards or validation (using Zod where appropriate).
2. **No Type Assertions (`as any`)**: Do not use `as any` to bypass type
   checking. If you must use a type assertion, use the most specific type
   possible and provide a comment explaining why it is necessary.
3. **No Non-null Assertions (`!`)**: Never use the `!` operator to assert that a
   value is non-null or defined. Instead:
   - Use optional chaining (`?.`).
   - Use nullish coalescing (`??`).
   - Implement explicit null/undefined checks.
   - Use narrowing to ensure the value exists.

## 🛠️ Implementation Guidelines

- **Zod Validation**: Utilize the existing Zod integration for runtime type
  safety and validation, especially when dealing with external data (like
  `birthdays.json`).
- **Discriminated Unions**: Use discriminated unions to handle complex state or
  object shapes safely.
- **Type Inference**: Rely on TypeScript's type inference where it is clear, but
  provide explicit types for function parameters and return types to improve
  readability and catch errors early.
