export default function RecaptchaFieldDescription() {
  return (
    <div>
      Uses Google reCAPTCHA v3. Configure <code>NEXT_PUBLIC_RECAPTCHA_SITE_KEY</code> and{' '}
      <code>RECAPTCHA_SECRET_KEY</code>, then submit-time verification will check the action and
      minimum score.
    </div>
  )
}
