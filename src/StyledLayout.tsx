import { Layout } from "antd";
import styled from "styled-components";

export const StyledLayout = styled(Layout)`
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-areas: "header", "content", "footer";
  > .ant-layout-header {
    grid-area: "header";
  }
  > .ant-layout-content {
    grid-area: "content";
    padding: 25px 50px;
    background-color: white;
    overflow: auto;
  }
  > .ant-layout-footer {
    grid-area: "footer";
    text-align: end;
    padding: 15px 50px;
  }
`;
