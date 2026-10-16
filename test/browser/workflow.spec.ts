import { test, expect, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:5189";
async function login(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}
test("admin onboarding, private journals, JSON import, history, conflict and failed-save recovery", async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "browseradmin", "browser-admin-password");
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByLabel("新用户名", { exact: true }).fill("browseruser");
  await page
    .getByLabel("临时密码", { exact: true })
    .fill("browser-temp-password");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "browseruser", exact: true }),
  ).toBeVisible();
  const context = await browser.newContext();
  const user = await context.newPage();
  user.on("pageerror", (e) => errors.push(e.message));
  await login(user, "browseruser", "browser-temp-password");
  await expect(
    user.getByRole("heading", { name: "请修改临时密码" }),
  ).toBeVisible();
  await user
    .getByLabel("原密码", { exact: true })
    .fill("browser-temp-password");
  await user
    .getByLabel("新密码", { exact: true })
    .fill("browser-user-password");
  await user
    .getByLabel("确认新密码", { exact: true })
    .fill("browser-user-password");
  await user.getByRole("button", { name: "保存并重新登录" }).click();
  await expect(user.getByLabel("用户名", { exact: true })).toBeVisible();
  await login(user, "browseruser", "browser-user-password");
  await expect(
    user.getByRole("button", { name: "JSON 导入 / 导出" }),
  ).toBeVisible();
  await expect(
    user.getByRole("button", { name: "用户管理", exact: true }),
  ).toHaveCount(0);
  const date = await user.locator("input[type=date]").inputValue();
  await user.getByRole("button", { name: "JSON 导入 / 导出" }).click();
  const record = {
    date,
    blocks: [
      {
        id: "imported",
        start: "09:00",
        end: "10:00",
        summary: "浏览器导入记录",
        source: "from_media",
        linkedMediaIds: ["old"],
      },
    ],
    media: [{ id: "old" }],
  };
  await user.locator("input[type=file]").setInputFiles([
    {
      name: `${date}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(record)),
    },
    {
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{"),
    },
  ]);
  await expect(
    user.getByRole("button", { name: "确认导入 1 项" }),
  ).toBeVisible();
  await user.getByRole("button", { name: "确认导入 1 项" }).click();
  await expect(
    user.getByRole("cell", { name: "已新增", exact: true }),
  ).toBeVisible();
  await user.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(user.locator(".block-card")).toContainText("浏览器导入记录");
  await expect(user.getByText("当日照片")).toHaveCount(0);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.locator(".block-card")).toHaveCount(0);
  const me = await (await user.request.get("/api/auth/me")).json();
  const request = async (body: unknown) =>
    user.request.put(`/api/days/${date}`, {
      headers: { Origin: origin, "X-CSRF-Token": me.csrf },
      data: body,
    });
  // Another tab edits after this tab loaded revision 1.
  const serverDay = {
    date,
    blocks: [
      {
        id: "imported",
        start: "09:00",
        end: "10:00",
        summary: "另一设备的内容",
        source: "manual",
      },
    ],
  };
  expect(
    (await request({ day: serverDay, expectedRevision: 1 })).status(),
  ).toBe(200);
  await user.locator(".block-card").click();
  await user
    .locator(".block-editor input[type=text]")
    .first()
    .fill("需要保留的草稿");
  await user.getByRole("button", { name: "保存", exact: true }).click();
  await expect(user.getByRole("alert")).toContainText("其他页面修改");
  await expect(user.locator(".block-card")).toContainText("需要保留的草稿");
  const [draft] = await Promise.all([
    user.waitForEvent("download"),
    user.getByRole("button", { name: "下载草稿" }).click(),
  ]);
  expect(draft.suggestedFilename()).toBe(`${date}.json`);
  user.once("dialog", (d) => d.accept());
  await user.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(user.locator(".block-card")).toContainText("另一设备的内容");
  await user.getByRole("button", { name: "历史版本", exact: true }).click();
  await user.getByRole("button", { name: /版本 1 ·/ }).click();
  await expect(user.locator("pre")).toContainText("浏览器导入记录");
  user.once("dialog", (d) => d.accept());
  await user.getByRole("button", { name: "恢复此版本" }).click();
  await expect(user.locator(".block-card")).toContainText("浏览器导入记录");
  await user.route(`**/api/days/${date}`, (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await user.locator(".block-card").click();
  await user
    .locator(".block-editor input[type=text]")
    .first()
    .fill("断网后重试成功");
  await user.getByRole("button", { name: "保存", exact: true }).click();
  await expect(user.getByRole("button", { name: "重试保存" })).toBeVisible();
  await user.unroute(`**/api/days/${date}`);
  await Promise.all([
    user.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().endsWith(`/api/days/${date}`) &&
        r.status() === 200,
    ),
    user.getByRole("button", { name: "重试保存" }).click(),
  ]);
  await expect(user.getByRole("button", { name: "重试保存" })).toHaveCount(0);
  expect(
    (await (await user.request.get(`/api/days/${date}`)).json()).day.blocks[0]
      .summary,
  ).toBe("断网后重试成功");
  await user.screenshot({
    path: "test-results/server-journal.png",
    fullPage: true,
  });
  // Disable the account from the real admin UI and trigger a fresh protected request.
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "browseruser", exact: true }),
    })
    .getByRole("button", { name: "停用", exact: true })
    .click();
  await user.getByRole("button", { name: "下一天", exact: true }).click();
  await expect(
    user.getByText(
      "登录已过期。重新登录同一账户可继续处理当前草稿；切换账户会清空当前页面。",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByLabel("用户名", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
