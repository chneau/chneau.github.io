import { Card, Input, Layout, Table } from "antd";
import { useMemo, useState } from "react";
import { StyledLayout } from "./StyledLayout";
import { Birthday, birthdays } from "./birthdays";

const columns = [
  {
    title: "Name",
    dataIndex: "name",
    sorter: (a: Birthday, b: Birthday) => a.name.localeCompare(b.name),
  },
  {
    title: "Year",
    dataIndex: "year",
    sorter: (a: Birthday, b: Birthday) => a.year - b.year,
  },
  {
    title: "Month",
    dataIndex: "month",
    sorter: (a: Birthday, b: Birthday) => a.month - b.month,
  },
  {
    title: "Day",
    dataIndex: "day",
    sorter: (a: Birthday, b: Birthday) => a.day - b.day,
  },
  {
    title: "Age",
    dataIndex: "age",
  },
];

export const App = () => {
  const [search, setSearch] = useState("");
  const filteredBirthdays = useMemo(() => birthdays.filter((bday) => bday.name.toLowerCase().includes(search.toLowerCase())), [search]);
  const data = useMemo(() => {
    return filteredBirthdays.map((bday, idx) => ({
      key: idx,
      ...bday,
    }));
  }, [filteredBirthdays]);
  return (
    <StyledLayout>
      <Layout.Header></Layout.Header>
      <Layout.Content>
        <Card title="Birthdays">
          <Input.Search placeholder="Search..." style={{ marginBottom: 8 }} onChange={(e) => setSearch(e.target.value)} value={search} />
          <Table columns={columns} dataSource={data} pagination={false} size="small" />
        </Card>
      </Layout.Content>
      <Layout.Footer>Charles ©2023</Layout.Footer>
    </StyledLayout>
  );
};
