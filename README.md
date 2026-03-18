# TEM-4 Dictation Grading MVP

基于 `Next.js + TypeScript + Tailwind CSS` 的 TEM-4 听写批改工具。

## OCR Strategy

本项目使用混合 OCR 策略，兼顾成本与手写识别准确率：

- `参考答案`
  - 默认使用本地 / 浏览器侧 OCR（Tesseract.js）
  - 适合打印体，避免额外云端成本
- `学生作答`
  - 默认使用服务端 Google Cloud Vision `DOCUMENT_TEXT_DETECTION`
  - 更适合可能包含手写英文的场景

无论哪条 OCR 路径，最终批改都只使用用户在文本框中最终确认的文本。OCR 结果只是草稿，不会自动把学生错误改成参考答案。

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

可用环境变量如下：

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

## Testing Both OCR Paths

### Reference OCR path

1. 上传 `参考答案` 图片
2. 点击“图片转文字”
3. 确认页面显示的是本地 OCR 说明
4. 手动修改文本后再批改

### Student OCR path

1. 配好 Google Vision 凭据
2. 上传 `学生作答` 图片
3. 点击“图片转文字”
4. 确认页面显示的是高精度 OCR 说明
5. 若 Google OCR 失败，应看到中文错误信息，且文本框仍可手动编辑、可继续重试

### Mobile verification

手机实机验证建议：

1. 电脑运行 `npm run dev`
2. 手机和电脑连接同一 Wi-Fi
3. 用电脑局域网 IP 访问，例如 `http://192.168.x.x:3000`
4. 分别测试文件、相册、相机拍照入口
5. 测试 OCR、手动修订、批改历史重开和只读快照

## Verification Commands

```bash
npm run lint
npm run build
```
