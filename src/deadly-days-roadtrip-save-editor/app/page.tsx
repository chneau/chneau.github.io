import { SaveWorkbench } from "../../shared";
import { deadlyDays } from "../lib/format";

export const Home = () => <SaveWorkbench codec={deadlyDays} />;
