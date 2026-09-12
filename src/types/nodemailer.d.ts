declare module 'nodemailer' {
  type Transporter = {
    sendMail: (...args: unknown[]) => Promise<unknown>
  }

  const nodemailer: {
    createTransport: (url: string) => Transporter
  }

  export default nodemailer
}
