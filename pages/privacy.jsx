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
          RuHua · 入画 &nbsp;·&nbsp; Last updated: July 6, 2026
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
          <li>We request camera access solely to capture your selfie for the face-compositing feature.</li>
          <li>Your selfie is sent to our AI processing server to generate a portrait in the style of the selected painting.</li>
          <li>We do not store your selfie or the generated portrait on our servers beyond the duration required to process and return the result (typically seconds).</li>
          <li>Your selfie may be temporarily cached on your device for convenience. This cache is stored only on your device and can be cleared by deleting the app.</li>
        </ul>
        <p><strong>Usage Data</strong></p>
        <ul>
          <li>We do not collect analytics, crash reports, or behavioral tracking data.</li>
          <li>We do not use third-party advertising SDKs.</li>
        </ul>
        <p><strong>Third-Party AI Services</strong></p>
        <ul>
          <li>Portrait generation uses third-party AI APIs (aimlapi.com). Your selfie image is transmitted to these services solely for processing.</li>
          <li>Generated portraits are hosted temporarily on their servers and accessed via secure URLs.</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Data We Do NOT Collect</h3>
        <ul>
          <li>We do not collect your name, email address, phone number, or any personally identifiable information.</li>
          <li>We do not create user accounts.</li>
          <li>We do not track your location.</li>
          <li>We do not sell, rent, or share your data with third parties for marketing purposes.</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>Data Retention</h3>
        <p>Selfie images are processed in real time and not retained on our servers. Cached selfies on your device are deleted when you clear the app cache or delete the app.</p>

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
          <li>我们仅为面部合成功能申请相机权限。</li>
          <li>您的自拍将被发送至AI处理服务器，以生成所选画作风格的肖像。</li>
          <li>我们不会在服务器上长期存储您的自拍或生成的图像——处理完成后即自动清除。</li>
          <li>为方便使用，您的自拍可能临时缓存在设备本地，删除应用即可清除。</li>
        </ul>
        <p><strong>使用数据</strong></p>
        <ul>
          <li>我们不收集数据分析、崩溃报告或行为追踪数据。</li>
          <li>我们不使用任何第三方广告SDK。</li>
        </ul>
        <p><strong>第三方AI服务</strong></p>
        <ul>
          <li>肖像生成使用第三方AI接口（aimlapi.com），您的自拍仅用于处理目的。</li>
          <li>生成的肖像临时托管在其服务器上，通过安全链接访问。</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>我们不收集的数据</h3>
        <ul>
          <li>我们不收集您的姓名、邮箱、手机号或任何个人身份信息。</li>
          <li>我们不创建用户账户。</li>
          <li>我们不追踪您的地理位置。</li>
          <li>我们不将您的数据出售、出租或共享给第三方用于营销目的。</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32 }}>数据保留</h3>
        <p>自拍图像实时处理，不在服务器上保留。设备本地缓存的自拍在删除应用后即被清除。</p>

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
