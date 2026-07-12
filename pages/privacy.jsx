export default function Privacy() {
  return (
    <div style={{
      maxWidth: 720, margin: '0 auto', padding: '48px 24px',
      fontFamily: 'Georgia, serif', lineHeight: 1.8,
      color: '#1a1008', background: '#faf6ef', minHeight: '100vh',
    }}>
      <div style={{ marginBottom: 48, borderBottom: '2px solid #c0392b', paddingBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#c0392b' }}>
          隐私政策 · Privacy Policy
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#888' }}>
          RuHua · 入画 &nbsp;·&nbsp; Last updated: July 12, 2026
        </p>
      </div>

      {/* English */}
      <section style={{ marginBottom: 64 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, borderBottom: '1px solid #e0d4c0', paddingBottom: 8 }}>English</h2>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Overview</h3>
        <p>RuHua ("we", "our", or "the app") is an AI-powered app that composites your selfie into classical Chinese paintings. We are committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights.</p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Data We Collect</h3>
        <p><strong>Camera and Photos</strong></p>
        <ul>
          <li>We request camera or photo library access solely so you can provide a selfie for the face-compositing feature.</li>
          <li>Your selfie image is sent to a third-party AI service to generate a stylized portrait in the style of the selected painting (see "Third-Party AI Services" below).</li>
          <li>We do not store your selfie or the generated portrait on our own servers beyond the single request needed to process and return the result (typically seconds).</li>
          <li>Your selfie is cached on your device (in the app's local storage) so you don't need to retake it each time you try a different painting. This on-device copy persists until you take a new selfie (which replaces it) or delete the app.</li>
        </ul>
        <p><strong>Facial Geometry Data</strong></p>
        <ul>
          <li>To position and align the generated portrait onto the painting, the app uses on-device face detection (Google's MediaPipe library) to identify facial landmarks — a set of coordinate points describing the geometry of your face (e.g. eyes, jawline, chin).</li>
          <li>This landmark data is detected entirely on your device. Only the coordinate data (not any image) is sent to our own server to calculate how to crop and position the generated portrait onto the painting.</li>
          <li>Landmark data is used solely for this compositing calculation. It is not used for identification, authentication, or any biometric matching purpose, is not shared with any third party, and is not stored — it exists only for the duration of the compositing request.</li>
        </ul>
        <p><strong>Usage Data</strong></p>
        <ul>
          <li>We do not collect analytics, crash reports, or behavioral tracking data.</li>
          <li>We do not use third-party advertising SDKs.</li>
        </ul>
        <p><strong>Third-Party AI Services</strong></p>
        <ul>
          <li>Portrait generation uses third-party AI APIs, primarily aimlapi.com (hosting the Seedream model). Your selfie image is transmitted to this service solely to generate the stylized portrait.</li>
          <li>If the primary service is unavailable, the app may fall back to Replicate (replicate.com) to complete the same generation step. Your selfie image would be transmitted to Replicate under the same conditions.</li>
          <li>Generated portraits are hosted temporarily on these services' infrastructure and retrieved via secure URLs; we do not maintain a separate copy on our own servers.</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Data We Do NOT Collect</h3>
        <ul>
          <li>We do not collect your name, email address, phone number, or any personally identifiable information.</li>
          <li>We do not create user accounts.</li>
          <li>We do not track your location.</li>
          <li>We do not sell, rent, or share your data with third parties for marketing purposes.</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Data Retention</h3>
        <ul>
          <li><strong>Servers:</strong> Your selfie and any generated portrait are processed in real time and are not retained on our servers or by our AI processing partners beyond the time needed to generate and return your result.</li>
          <li><strong>Your device:</strong> Your most recent selfie and a small number of recently generated portraits are cached in the app's local storage on your device, so you can revisit different paintings without retaking your selfie. This cache is replaced each time you take a new selfie, and is fully cleared when you delete the app.</li>
          <li><strong>Facial landmark data</strong> is not retained anywhere — it is calculated fresh from your selfie each time and discarded immediately after use.</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Children's Privacy</h3>
        <p>RuHua is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Changes to This Policy</h3>
        <p>We may update this policy from time to time. The "Last updated" date at the top will reflect any changes. Continued use of the app constitutes acceptance of the updated policy.</p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Contact</h3>
        <p>If you have questions about this privacy policy, please contact us at: <a href="mailto:ruhua.contact@gmail.com" style={{ color: '#c0392b' }}>ruhua.contact@gmail.com</a></p>
      </section>

      {/* Chinese */}
      <section>
        <h2 style={{ fontSize: 20, fontWeight: 700, borderBottom: '1px solid #e0d4c0', paddingBottom: 8 }}>中文</h2>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>概述</h3>
        <p>入画（"我们"或"本应用"）是一款利用AI技术将您的自拍融入中国古典绘画的应用。我们致力于保护您的隐私。本政策说明我们收集哪些数据、如何使用以及您的权利。</p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>我们收集的数据</h3>
        <p><strong>相机与照片</strong></p>
        <ul>
          <li>我们仅为面部合成功能申请相机或照片权限，以便您提供自拍照片。</li>
          <li>您的自拍图像将被发送至第三方AI服务，以生成所选画作风格的肖像（详见下方"第三方AI服务"）。</li>
          <li>我们不会在自有服务器上长期存储您的自拍或生成的肖像——仅在处理单次请求期间使用（通常为几秒钟）。</li>
          <li>您的自拍会缓存在设备本地存储中，以便您无需重新拍摄即可尝试不同画作。该本地缓存会在您拍摄新的自拍时被替换，或在您删除应用时被清除。</li>
        </ul>
        <p><strong>面部几何数据</strong></p>
        <ul>
          <li>为了将生成的肖像准确对位到画作上，应用使用设备本地的人脸检测技术（Google MediaPipe库）识别面部关键点——一组描述面部几何特征（如眼睛、下颌线、下巴）的坐标点。</li>
          <li>该关键点数据完全在您的设备上检测完成。仅坐标数据（不含任何图像）会被发送至我们自己的服务器，用于计算生成肖像在画作上的裁剪与定位方式。</li>
          <li>关键点数据仅用于此项合成计算，不用于身份识别、身份验证或任何生物特征比对用途，不会与任何第三方共享，也不会被存储——该数据仅在合成请求处理期间存在。</li>
        </ul>
        <p><strong>使用数据</strong></p>
        <ul>
          <li>我们不收集数据分析、崩溃报告或行为追踪数据。</li>
          <li>我们不使用任何第三方广告SDK。</li>
        </ul>
        <p><strong>第三方AI服务</strong></p>
        <ul>
          <li>肖像生成使用第三方AI接口，主要为aimlapi.com（托管Seedream模型）。您的自拍图像仅为生成风格化肖像而被发送至该服务。</li>
          <li>若主要服务不可用，应用可能会切换至Replicate（replicate.com）以完成相同的生成步骤，您的自拍图像在此情况下也会以相同方式被发送至该服务。</li>
          <li>生成的肖像临时托管在上述服务的基础设施中，并通过安全链接获取；我们不会在自有服务器上另行保留副本。</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>我们不收集的数据</h3>
        <ul>
          <li>我们不收集您的姓名、邮箱、手机号或任何个人身份信息。</li>
          <li>我们不创建用户账户。</li>
          <li>我们不追踪您的地理位置。</li>
          <li>我们不将您的数据出售、出租或共享给第三方用于营销目的。</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>数据保留</h3>
        <ul>
          <li><strong>服务器端：</strong>您的自拍及生成的肖像均为实时处理，处理完成后不会在我们的服务器或AI处理合作方处保留。</li>
          <li><strong>设备端：</strong>您最近一次的自拍及少量近期生成的肖像会缓存在应用的设备本地存储中，以便您无需重新拍摄即可查看不同画作效果。该缓存会在您拍摄新自拍时被替换，并在您删除应用时被完全清除。</li>
          <li><strong>面部关键点数据</strong>不会在任何位置被保留——每次均基于您的自拍即时计算，使用后立即丢弃。</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>儿童隐私</h3>
        <p>入画不面向13岁以下儿童。我们不会故意收集13岁以下儿童的个人信息。</p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>政策变更</h3>
        <p>我们可能不时更新本政策。顶部的"最后更新"日期将反映任何变更。继续使用本应用即表示接受更新后的政策。</p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>联系我们</h3>
        <p>如您有任何疑问，请联系：<a href="mailto:ruhua.contact@gmail.com" style={{ color: '#c0392b' }}>ruhua.contact@gmail.com</a></p>
      </section>

      <div style={{ marginTop: 64, paddingTop: 24, borderTop: '1px solid #e0d4c0', fontSize: 13, color: '#999', textAlign: 'center' }}>
        © 2026 RuHua · 入画
      </div>
    </div>
  );
}
