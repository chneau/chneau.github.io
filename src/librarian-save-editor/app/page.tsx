import { SaveWorkbench } from "../../shared";
import { librarian } from "../lib/format";

export const Home = () => <SaveWorkbench codec={librarian} />;
