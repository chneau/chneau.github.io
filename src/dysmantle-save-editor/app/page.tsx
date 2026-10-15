import { SaveWorkbench } from "../../shared";
import { dysmantle } from "../lib/format";

export const Home = () => <SaveWorkbench codec={dysmantle} />;
