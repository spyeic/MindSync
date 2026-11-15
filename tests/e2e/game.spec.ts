import { expect, test, type Page } from '@playwright/test';
import type { GameDetail, Reply, RoomView } from '../../lib/protocol';

async function endGame(page: Page) {
  await page.getByRole('button', { name: '结束本局', exact: true }).click();
  await page.getByRole('dialog', { name: '结束本局？' }).getByRole('button', { name: '确认结束', exact: true }).click();
}

test('two browsers play, reconnect, match, settle early and browse game history', async ({ page: a, browser, baseURL, isMobile }) => {
  const partner = await browser.newContext({ baseURL, ...(isMobile ? { viewport: { width: 390, height: 844 }, hasTouch: true } : {}) });
  const b = await partner.newPage();
  const outsider = await browser.newContext({ baseURL });
  const socketFrames: string[] = [];
  let sawWebSocket = false;
  b.on('websocket', (ws) => {
    if (!ws.url().includes('/socket.io/')) return;
    sawWebSocket = true;
    ws.on('framereceived', ({ payload }) => { socketFrames.push(String(payload)); });
  });
  const unexpected: string[] = [];
  a.on('pageerror', (error) => unexpected.push(error.message));
  b.on('pageerror', (error) => unexpected.push(error.message));
  try {
    await a.goto('/');
    await expect(a).toHaveTitle('MindSync — 心有灵犀');
    await a.getByRole('button', { name: '创建房间' }).click();
    const create = a.getByRole('dialog', { name: '创建房间' });
    await create.getByLabel('你的昵称').fill('海盐');
    await create.getByLabel('每轮时间（秒）').fill('20');
    await create.getByLabel('最大回合').fill('3');
    await create.getByRole('button', { name: '创建并进入房间' }).click();
    await expect(a.getByRole('heading', { name: '等一位搭档' })).toBeVisible();
    const invite = await a.getByLabel('邀请链接', { exact: true }).inputValue();
    const code = await a.getByLabel('房间码', { exact: true }).inputValue();
    expect(code).toMatch(/^[0-9]{4}$/);
    expect(invite).toBe(`${baseURL}/room/${code}`);

    await b.goto(invite);
    await b.getByLabel('你的昵称').fill('小鹿');
    await b.getByRole('button', { name: '加入游戏' }).click();
    await expect(b.getByText('已连接')).toBeVisible();
    await expect(a.getByRole('heading', { name: '准备开始' })).toBeVisible();
    const stranger = await outsider.newPage();
    await stranger.goto(invite);
    await expect(stranger.locator('main').getByRole('alert')).toContainText('已经满员');

    await a.getByRole('button', { name: '开始游戏' }).click();
    await expect(b.getByRole('heading', { name: '第 1 / 3 轮' })).toBeVisible();
    const firstWord = '秘密灯塔';
    await a.getByRole('textbox', { name: '你的词语' }).fill(firstWord);
    await a.getByRole('textbox', { name: '你的词语' }).press('Enter');
    await expect(b.getByText('对方已提交。', { exact: false })).toBeVisible();
    await expect(b.getByText(firstWord, { exact: true })).toHaveCount(0);
    expect(socketFrames.join(' ')).not.toContain(firstWord);
    const pending = await (await b.request.get(`/api/rooms/${code}`)).json() as Reply<{ room: RoomView }>;
    expect(pending.ok).toBe(true);
    expect(JSON.stringify(pending)).not.toContain(firstWord);
    if (!pending.ok) throw new Error('Missing room');
    const id = pending.data.room.game!.id;
    expect((await b.request.get(`/api/history/${id}`)).status()).toBe(404);
    expect((await stranger.request.get(`/api/rooms/${code}`)).status()).toBe(409);

    await b.reload();
    await expect(b.getByText('已连接')).toBeVisible();
    await expect(b.getByText('对方已提交。', { exact: false })).toBeVisible();
    await expect(b.getByText(firstWord, { exact: true })).toHaveCount(0);
    await b.getByRole('textbox', { name: '你的词语' }).fill('月亮');
    await b.getByRole('button', { name: '提交词语' }).click();
    const rounds = a.getByRole('list', { name: '各轮词语' });
    await expect(rounds.getByText(firstWord)).toBeVisible();
    await expect(rounds.getByText('月亮')).toBeVisible();
    await expect(a.getByRole('heading', { name: '第 2 / 3 轮' })).toBeVisible();
    await expect(b.getByRole('heading', { name: '看到这两个词，你会想到什么？' })).toBeVisible();

    if (!isMobile) {
      await partner.setOffline(true);
      await expect(b.getByText('正在连接')).toBeVisible({ timeout: 20_000 });
      await partner.setOffline(false);
      await expect(b.getByText('已连接')).toBeVisible({ timeout: 10_000 });
    }
    await a.getByRole('textbox', { name: '你的词语' }).fill('潮汐');
    await b.getByRole('textbox', { name: '你的词语' }).fill('潮汐');
    await Promise.all([a.getByRole('button', { name: '提交词语' }).click(), b.getByRole('button', { name: '提交词语' }).click()]);
    await expect(a.getByRole('heading', { name: '心有灵犀！' })).toBeVisible();
    await expect(b.getByRole('heading', { name: '心有灵犀！' })).toBeVisible();
    expect(sawWebSocket).toBe(true);
    await expect(b.getByRole('button', { name: '新开一局' })).toHaveCount(0);
    await b.getByRole('link', { name: '查看历史记录' }).click();
    await expect(b.getByRole('heading', { name: '历史记录' })).toBeVisible();
    const history = b.getByRole('list', { name: '已结算的对局' });
    await expect(history).toBeVisible();
    await expect(history).not.toContainText(`房间 ${code}`);
    await b.getByRole('link', { name: /和 海盐 的对局.*匹配成功/ }).click();
    await expect(b.getByText(firstWord)).toBeVisible();
    const detail = await (await b.request.get(`/api/history/${id}`)).json() as Reply<GameDetail>;
    expect(detail.ok && detail.data.history.map(({ words }) => words)).toEqual([[firstWord, '月亮'], ['潮汐', '潮汐']]);
    expect((await stranger.request.get(`/api/history/${id}`)).status()).toBe(404);
    const strangerHistory = await stranger.request.get('/api/history');
    expect(strangerHistory).toBeOK();
    expect(await strangerHistory.json()).toMatchObject({ data: { items: [] } });
    await expect(b.locator('.history-detail')).not.toContainText(`房间 ${code}`);
    await b.getByRole('link', { name: '返回历史记录' }).click();
    await expect(history).toBeVisible();
    await b.getByRole('link', { name: '首页', exact: true }).click();
    await b.getByRole('button', { name: '加入房间', exact: true }).click();
    const join = b.getByRole('dialog', { name: '加入房间' });
    await join.getByLabel('房间码（4 位数字）').fill(code);
    await join.getByLabel('你的昵称').fill('小鹿');
    await join.getByRole('button', { name: '进入房间' }).click();
    await expect(b.getByRole('button', { name: '等待房主开始' })).toBeVisible();
    await a.getByRole('button', { name: '新开一局' }).click();
    await expect(a.getByRole('heading', { name: '第 1 / 3 轮' })).toBeVisible();
    await expect(b.getByRole('heading', { name: '第 1 / 3 轮' })).toBeVisible();
    expect(await b.request.get(`/api/history/${id}`)).toBeOK();
    await a.getByRole('textbox', { name: '你的词语' }).fill('铃铛');
    await a.getByRole('button', { name: '提交词语' }).click();
    await expect(b.getByText('对方已提交。', { exact: false })).toBeVisible();
    await expect(b.getByText('铃铛', { exact: true })).toHaveCount(0);
    const endButton = b.getByRole('button', { name: '结束本局', exact: true });
    await endButton.focus();
    await endButton.press('Enter');
    const endDialog = b.getByRole('dialog', { name: '结束本局？' });
    await expect(endDialog).toBeVisible();
    await expect(endDialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    await b.keyboard.press('Escape');
    await expect(endDialog).not.toBeVisible();
    await expect(endButton).toBeFocused();
    await expect(a.getByRole('heading', { name: '第 1 / 3 轮' })).toBeVisible();

    await endButton.click();
    await endDialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(endDialog).not.toBeVisible();
    await expect(b.getByText('对方已提交。', { exact: false })).toBeVisible();
    await endGame(b);
    await expect(a.getByRole('heading', { name: '本局提前结束' })).toBeVisible();
    await expect(b.getByRole('heading', { name: '本局提前结束' })).toBeVisible();
    await expect(b.getByRole('list', { name: '各轮词语' })).toContainText('铃铛');
    await expect(b.getByRole('list', { name: '各轮词语' })).toContainText('未提交');
    await b.getByRole('link', { name: '查看历史记录' }).click();
    await expect(b.getByRole('link', { name: /和 海盐 的对局.*匹配成功/ })).toBeVisible();
    await expect(history.getByRole('listitem').first()).toContainText('提前结束');
    const descending = b.getByRole('button', { name: /^倒序/ });
    const ascending = b.getByRole('button', { name: /^正序/ });
    await descending.focus();
    await descending.press('Enter');
    await expect(b).toHaveURL(/order=oldest$/);
    await expect(history.getByRole('listitem').first()).toContainText('匹配成功');
    await expect(ascending).toBeFocused();
    await ascending.press('Enter');
    await expect(b).toHaveURL(/order=newest$/);
    await expect(history.getByRole('listitem').first()).toContainText('提前结束');
    await b.getByRole('link', { name: /和 海盐 的对局.*提前结束/ }).click();
    await expect(b.getByRole('heading', { name: '本局提前结束' })).toBeVisible();
    await expect(b.getByRole('list', { name: '各轮词语' })).toContainText('铃铛');
    expect(unexpected).toEqual([]);
  } finally {
    await outsider.close();
    await partner.close();
  }
});

test('reports when a seated player leaves or returns through navigation and tab closure', async ({ page: host, browser, baseURL }) => {
  const partner = await browser.newContext({ baseURL });
  try {
    await host.goto('/');
    await host.getByRole('button', { name: '创建房间', exact: true }).click();
    await host.getByRole('button', { name: '创建并进入房间' }).click();
    const invite = await host.getByLabel('邀请链接', { exact: true }).inputValue();
    const notice = host.getByRole('status', { name: '搭档在线状态' });

    const guest = await partner.newPage();
    await guest.goto('/');
    await guest.goto(invite);
    await guest.getByLabel('你的昵称').fill('搭档小鹿');
    await guest.getByRole('button', { name: '加入游戏' }).click();
    await expect(guest.getByText('已连接')).toBeVisible();
    await expect(host.getByText('搭档小鹿', { exact: true })).toBeVisible();
    await expect(notice).toBeEmpty();
    const lobbyTitle = host.getByRole('heading', { name: '准备开始' });
    const lobbyTitleBeforeNotice = await lobbyTitle.boundingBox();

    await guest.goBack();
    await expect(notice).toContainText('搭档小鹿 离开了房间');
    expect(await lobbyTitle.boundingBox()).toEqual(lobbyTitleBeforeNotice);
    await guest.goForward();
    await expect(notice).toContainText('搭档小鹿 回来了');
    expect(await lobbyTitle.boundingBox()).toEqual(lobbyTitleBeforeNotice);

    await guest.getByRole('link', { name: '首页', exact: true }).click();
    await expect(notice).toContainText('搭档小鹿 离开了房间');
    await guest.goBack();
    await expect(notice).toContainText('搭档小鹿 回来了');

    await host.getByRole('button', { name: '开始游戏' }).click();
    await expect(host.getByRole('heading', { name: '第 1 / 15 轮' })).toBeVisible();
    const roundProgress = host.getByRole('progressbar', { name: '本轮剩余时间' });
    const pauseProgress = host.getByRole('progressbar', { name: '等待玩家返回剩余时间' });
    const duplicate = await partner.newPage();
    await duplicate.goto(invite);
    await expect(duplicate.getByText('已连接')).toBeVisible();
    await guest.close();
    await expect(host.getByText('游戏已暂停', { exact: true })).toHaveCount(0);
    await duplicate.close();
    await expect(host.getByText('游戏已暂停', { exact: true })).toBeVisible();
    await expect(host.getByRole('progressbar', { name: '等待玩家返回剩余时间' })).toBeVisible();
    await expect(host.getByRole('textbox', { name: '你的词语' })).toBeDisabled();
    await expect(roundProgress).toHaveCount(0);
    await expect(notice).toContainText('搭档小鹿 离开了房间');
    const noticeBox = await notice.boundingBox();
    const headerBox = await host.locator('.round-header').boundingBox();
    expect(noticeBox && headerBox && noticeBox.y + noticeBox.height <= headerBox.y).toBe(true);
    expect(Number(await pauseProgress.getAttribute('value'))).toBeLessThanOrEqual(60_000);
    const roomCode = new URL(invite).pathname.split('/').at(-1);
    const snapshot = await host.request.get(`/api/rooms/${roomCode}`);
    const paused = await snapshot.json();
    expect(paused.data.room.game.pause.remainingMs).toBeGreaterThan(0);
    await host.reload();
    await expect(host.getByText('已连接')).toBeVisible();
    await expect(host.getByText('游戏已暂停', { exact: true })).toBeVisible();
    const restored = await (await host.request.get(`/api/rooms/${roomCode}`)).json();
    expect(restored.data.room.game.pause).toEqual(paused.data.room.game.pause);
    const reopened = await partner.newPage();
    await reopened.goto(invite);
    await expect(notice).toContainText('搭档小鹿 回来了');
    await expect(host.getByText('游戏已暂停', { exact: true })).toHaveCount(0);
    await expect(pauseProgress).toHaveCount(0);
    await expect(roundProgress).toBeVisible();
    await expect(host.getByRole('textbox', { name: '你的词语' })).toBeEnabled();
    await expect(reopened.getByRole('heading', { name: '第 1 / 15 轮' })).toBeVisible();
    await host.getByRole('textbox', { name: '你的词语' }).fill('保留词语');
    await host.getByRole('button', { name: '提交词语' }).click();
    await reopened.getByRole('link', { name: '首页', exact: true }).click();
    await expect(pauseProgress).toBeVisible();
    await endGame(host);
    await expect(host.getByRole('heading', { name: '本局提前结束' })).toBeVisible();
    await expect(host.getByText('空席位', { exact: true })).toBeVisible();
    await expect(notice).toBeEmpty();
    await expect(host.getByRole('button', { name: '新开一局' })).toBeDisabled();
    await expect(host.getByRole('list', { name: '各轮词语' })).toContainText('保留词语');
    const returning = await partner.newPage();
    await returning.goto(invite);
    await returning.getByLabel('你的昵称').fill('新搭档');
    await returning.getByRole('button', { name: '加入游戏' }).click();
    await expect(returning.getByRole('button', { name: '等待房主开始' })).toBeVisible();
    await expect(returning.getByText('保留词语')).toHaveCount(0);
    await host.getByRole('button', { name: '新开一局' }).click();
    await expect(returning.getByRole('heading', { name: '第 1 / 15 轮' })).toBeVisible();
    await host.goto('/');
    await expect(returning.getByText('游戏已暂停', { exact: true })).toBeVisible();
    await endGame(returning);
    await expect(returning.getByRole('heading', { name: '本局提前结束' })).toBeVisible();
    await expect(returning.getByRole('button', { name: '新开一局' })).toBeDisabled();
    await expect(returning.locator('.player-card').first()).toContainText('新搭档');
    await expect(returning.locator('.player-card').first()).toContainText('房主');
    await host.goto(invite);
    await host.getByRole('button', { name: '加入游戏' }).click();
    await returning.getByRole('button', { name: '新开一局' }).click();
    await expect(host.getByRole('heading', { name: '第 1 / 15 轮' })).toBeVisible();
    await endGame(host);
    await expect(returning.getByRole('heading', { name: '本局提前结束' })).toBeVisible();
    await returning.getByRole('link', { name: '首页', exact: true }).click();
    expect(await host.request.get(`/api/rooms/${roomCode}`)).toBeOK();
    await host.getByRole('link', { name: '查看历史记录' }).click();
    const history = host.getByRole('list', { name: '已结算的对局' });
    await expect(history).toContainText('和 新搭档 的对局');
    await expect.poll(async () => (await host.request.get(`/api/rooms/${roomCode}`)).status(), {
      timeout: 12_000,
      intervals: [5500, 1000],
    }).toBe(404);
    expect((await host.request.post(`/api/rooms/${roomCode}/join`, {
      headers: { Origin: baseURL! }, data: { nickname: '旧访客' },
    })).status()).toBe(404);
    await host.reload();
    await expect(history).toContainText('和 新搭档 的对局');
  } finally {
    await partner.close();
  }
});

test('keeps the composer fixed while the round history scrolls', async ({ page: host, browser, baseURL, isMobile }) => {
  const partner = await browser.newContext({ baseURL });
  try {
    await host.setViewportSize(isMobile ? { width: 390, height: 640 } : { width: 1100, height: 720 });
    await host.goto('/');
    await host.getByRole('button', { name: '创建房间', exact: true }).click();
    await host.getByRole('button', { name: '创建并进入房间' }).click();
    const invite = await host.getByLabel('邀请链接', { exact: true }).inputValue();
    const guest = await partner.newPage();
    await guest.goto(invite);
    await guest.getByRole('button', { name: '加入游戏' }).click();
    await expect(guest.getByText('已连接')).toBeVisible();
    await host.getByRole('button', { name: '开始游戏' }).click();
    for (let round = 1; round <= 5; round++) {
      await expect(host.getByRole('heading', { name: `第 ${round} / 15 轮` })).toBeVisible();
      await host.getByRole('textbox', { name: '你的词语' }).fill(`灯塔${round}`);
      await guest.getByRole('textbox', { name: '你的词语' }).fill(`星星${round}`);
      await host.getByRole('button', { name: '提交词语' }).click();
      await guest.getByRole('button', { name: '提交词语' }).click();
    }
    await expect(host.getByRole('heading', { name: '第 6 / 15 轮' })).toBeVisible();

    const track = host.getByRole('region', { name: '回合与联想轨迹' });
    const input = host.getByRole('textbox', { name: '你的词语' });
    await expect(track.getByRole('listitem')).toHaveCount(5);
    const measure = () => track.evaluate((el) => ({
      top: el.scrollTop,
      max: el.scrollHeight - el.clientHeight,
      page: window.scrollY,
    }));
    const end = await measure();
    expect(end.max).toBeGreaterThan(0);
    await expect.poll(async () => {
      const { max, top } = await measure();
      return max - top;
    }).toBeLessThan(8);
    const bottom = await input.boundingBox();
    expect(bottom).not.toBeNull();

    if (isMobile) {
      await track.focus();
      await host.keyboard.press('Home');
    } else {
      await track.hover();
      await host.mouse.wheel(0, -2000);
    }
    await expect.poll(async () => (await measure()).top).toBe(0);
    await host.evaluate(() => window.scrollTo(0, 1000));
    expect((await measure()).page).toBe(0);
    expect(await input.boundingBox()).toEqual(bottom);

    if (isMobile) {
      await input.focus();
      await host.evaluate(() => {
        const viewport = window.visualViewport;
        if (!viewport) throw new Error('Missing visual viewport');
        Object.defineProperties(viewport, {
          height: { configurable: true, value: 330 },
          offsetTop: { configurable: true, value: 55 },
        });
        viewport.dispatchEvent(new Event('resize'));
      });
      await expect(host.locator('html')).toHaveAttribute('data-game-keyboard', '');
      const bounds = await input.boundingBox();
      expect(bounds && bounds.y + bounds.height <= 385).toBe(true);
      await expect(input).toBeFocused();
      await host.evaluate(() => {
        const viewport = window.visualViewport!;
        Reflect.deleteProperty(viewport, 'height');
        Reflect.deleteProperty(viewport, 'offsetTop');
        viewport.dispatchEvent(new Event('resize'));
      });
      await expect(host.locator('html')).not.toHaveAttribute('data-game-keyboard', '');
      expect(await input.boundingBox()).toEqual(bottom);
    }
    await endGame(host);
    await expect(host.getByRole('heading', { name: '本局提前结束' })).toBeVisible();
    await expect(host.locator('html')).toHaveCSS('overflow-y', 'visible');
  } finally {
    await partner.close();
  }
});

test('native help, mobile layout, theme persistence, and HTTP origin control', async ({ page, baseURL }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '游戏玩法' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '游戏玩法' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '游戏玩法' })).toBeFocused();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '切换深浅主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect((await page.request.post('/api/session', { headers: { Origin: 'https://untrusted.example' }, data: {} })).status()).toBe(403);
  expect((await page.request.post('/api/session', { headers: { Origin: baseURL! }, data: {} })).status()).toBe(200);
});

test('blocks foreign WebSocket origins and disallows an unseated guest from watching or acting', async ({ page, baseURL }) => {
  const { io } = await import('socket.io-client');
  const origin = baseURL!;
  const session = await page.request.post('/api/session', { headers: { Origin: origin }, data: {} });
  expect(session).toBeOK();
  const cookie = session.headers()['set-cookie'].split(';')[0];
  const room = await page.request.post('/api/rooms', { headers: { Origin: origin }, data: {
    requestId: globalThis.crypto.randomUUID(), nickname: '房主', settings: { seconds: 30, maxRounds: 15 },
  } });
  expect(room).toBeOK();
  const { data: { code } } = await room.json() as { data: { code: string } };
  const stranger = await page.request.post('/api/session', { headers: { Origin: origin, Cookie: 'mindsync=invalid' }, data: {} });
  const outsiderCookie = stranger.headers()['set-cookie'].split(';')[0];

  const connect = (headers: Record<string, string>) => io(origin, {
    transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 2500, extraHeaders: headers,
  });
  const foreign = connect({ Origin: 'https://untrusted.example', Cookie: cookie });
  const anonymous = connect({ Origin: origin });
  const unseated = connect({ Origin: origin, Cookie: outsiderCookie });
  try {
    for (const client of [foreign, anonymous]) {
      const rejected = new Promise<void>((resolve, reject) => {
        client.once('connect_error', () => resolve());
        client.once('connect', () => reject(new Error('Unauthorized WebSocket connected')));
      });
      client.connect();
      await rejected;
    }
    await new Promise<void>((resolve, reject) => {
      unseated.once('connect', resolve);
      unseated.once('connect_error', reject);
      unseated.connect();
    });
    expect(await unseated.timeout(2500).emitWithAck('room:watch', { code })).toMatchObject({ ok: false, code: 'ROOM_FORBIDDEN' });
    expect(await unseated.timeout(2500).emitWithAck('room:command', { action: 'start' })).toMatchObject({ ok: false, code: 'ROOM_FORBIDDEN' });
  } finally {
    for (const client of [foreign, anonymous, unseated]) client.disconnect();
  }
});
