# TEM-4 Dictation Grading MVP

基于 `Next.js + TypeScript + Tailwind CSS` 的 TEM-4 听写批改工具。

## OCR Strategy

本项目使用成本优化后的混合 OCR 策略：

- `参考答案`
  - 始终使用本地 / 浏览器侧 OCR（Tesseract.js）
- `学生作答`
  - 先执行一次本地 OCR 探测
  - 再用确定性启发式判断更像印刷体还是非印刷体
  - 若判定为印刷体，直接复用本地 OCR 结果
  - 若判定为非印刷体 / 手写体，调用服务端 Google Cloud Vision `DOCUMENT_TEXT_DETECTION`

无论哪条 OCR 路径，最终批改都只使用用户在文本框中最终确认的文本。OCR 结果只是草稿，不会自动把学生错误改成参考答案。

## Student-side Heuristic

学生作答侧的印刷体判定基于一次便宜的本地 OCR 探测，使用以下启发式：

- 本地 OCR 是否成功返回稳定文本
- 有效英文词数量是否足够
- 本地 OCR 词级平均置信度是否较高
- 高置信度词比例是否足够
- 词形是否规整，例如是否大多是正常英文单词
- 超短碎片词比例是否过高

当前默认策略偏保守：

- 探测不稳定或信号不足时，升级到 Google Vision
- 只有在本地 OCR 结果看起来足够像印刷体时，才复用本地 OCR

## Local Development

```bash
npm install
npm run dev
```

默认地址为 [http://localhost:3000](http://localhost:3000)。

## Google Vision Setup

### 1. Enable API

在 Google Cloud Console 中启用 `Cloud Vision API`。

### 2. Prepare credentials

推荐使用服务账号，并授予可以调用 Vision API 的权限。

本项目支持两种服务端配置方式：

- 本地开发：
  - 设置 `GOOGLE_APPLICATION_CREDENTIALS` 指向服务账号 JSON 文件路径
  - 可选设置 `GOOGLE_CLOUD_PROJECT`
- Vercel / 其他部署平台：
  - 设置 `GOOGLE_CLOUD_CREDENTIALS_JSON`
  - 内容为完整服务账号 JSON 字符串
  - 可选设置 `GOOGLE_CLOUD_PROJECT`

注意：

- Google 凭据只在服务端读取
- 浏览器不会直接接触 Google 凭据
- 学生作答图片会先上传到项目自己的 `/api/ocr/student` 路由，再由服务器调用 Google Vision

## Environment Variables

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
GOOGLE_CLOUD_CREDENTIALS_JSON={"type":"service_account", ...}
```

本地通常使用 `GOOGLE_APPLICATION_CREDENTIALS` 更方便；Vercel 通常使用 `GOOGLE_CLOUD_CREDENTIALS_JSON` 更方便。

## OCR Flow

1. 上传图片
2. 图片转文字
3. 用户手动核对并编辑文本框
4. 点击批改
5. 评分引擎只读取文本框当前文本

保留的低风险 OCR 清理包括：

- 移除 `\`
- 移除 `/`
- 移除换行并合并为单行
- 规范化明显空白噪声

不会自动做基于参考答案的词级替换。

## Testing Both OCR Branches

### Reference answer

1. 上传 `参考答案` 图片
2. 点击“图片转文字”
3. 确认状态显示为本地识别

### Student answer: printed branch

1. 上传一张清晰的印刷体英语作答图片
2. 点击“图片转文字”
3. 确认先进入文本类型判断
4. 最终应显示 `本地识别（判定为印刷体）`
5. 检查返回文本是否直接来自本地 OCR

### Student answer: non-printed / handwritten branch

1. 上传一张手写或明显不规整的学生作答图片
2. 点击“图片转文字”
3. 确认先进入文本类型判断
4. 最终应显示 `高精度识别（判定为非印刷体）`
5. 检查是否由 Google Vision 返回结果

### Failure branch

1. 让 Google Vision 凭据缺失或失效
2. 上传一张会触发高精度 OCR 的学生图片
3. 应看到清晰中文错误信息
4. 页面不崩溃，文本框仍可手动编辑并可继续重试

### Mobile verification

1. 电脑运行 `npm run dev`
2. 手机和电脑连接同一 Wi-Fi
3. 用电脑局域网 IP 访问，例如 `http://192.168.x.x:3000`
4. 分别测试文件、相册、相机拍照入口
5. 测试参考答案本地 OCR 分支、学生作答印刷体分支、学生作答非印刷体分支
6. 测试手动修订、批改历史重开和只读快照

## Verification Commands

```bash
npm run lint
npm run build
```
