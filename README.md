# TEM-4 Dictation Grading MVP

基于 `Next.js + TypeScript + Tailwind CSS + Tesseract.js` 的 TEM-4 听写批改演示项目。

## Local Development

```bash
npm install
npm run dev
```

默认启动地址为 [http://localhost:3000](http://localhost:3000)。

## Key Behaviors

- 批改逻辑是确定性的规则引擎，最终批改只使用文本框中的当前文本。
- OCR 仅做低风险清理：移除 `\`、`/`、换行和明显格式噪声。
- OCR 额外提供“疑似识别问题”提示，但不会自动把学生错误改成参考答案。
- 历史记录支持本地保存、重开查看和只读快照模式。

## Mobile Verification

手机实机验证建议按下面流程执行：

1. 在电脑上运行 `npm run dev`。
2. 确认手机和电脑连接同一局域网/Wi-Fi。
3. 在电脑终端查看本机局域网 IP，例如 `192.168.x.x`。
4. 在手机浏览器访问 `http://你的局域网IP:3000`，不要使用 `localhost`。
5. 分别测试两侧上传入口：
   - 文件选择
   - 相册/照片
   - 相机拍照
6. 验证图片转文字后：
   - 已选择文件名是否可见
   - 转换状态是否可见
   - 错误信息是否能在手机端看到
   - “疑似识别问题”提示是否能展开查看并手动应用
7. 完成一次批改后，进入“批改历史”，重新打开记录，检查：
   - 文本是否保留
   - 图片是否保留且可点击查看
   - 历史记录页是否为只读快照

## Verification Commands

```bash
npm run lint
npm run build
```
