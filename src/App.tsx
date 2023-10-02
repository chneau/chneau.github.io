import { useState } from "react";

export const App = () => {
  const [count, setCount] = useState(0);
  const increment = () => setCount((x) => x + 1);
  return (
    <>
      <h1>Vite + React</h1>
      <div>
        <button onClick={increment}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p>Click on the Vite and React logos to learn more</p>
    </>
  );
};
