import { userRows } from "@/admin/queries";
import { getDb } from "@/db/client";

export async function UsersTab() {
  const rows = await userRows(getDb());
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr>
          <th>이름</th>
          <th>최근 활동</th>
          <th>플랜</th>
          <th>단계</th>
          <th>베타</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>{u.name}</td>
            <td>{u.lastActive ? u.lastActive.toISOString().slice(0, 16).replace("T", " ") : "-"}</td>
            <td>{u.plan ?? "free"}</td>
            <td>{u.stage ?? "-"}</td>
            <td>{u.isBeta ? "beta" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
