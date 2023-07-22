import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import {MongoDBAdapter} from "@auth/mongodb-adapter"
import clientPromise from "../../../lib/mongodb/client"
import Github from "next-auth/providers/github";

export default NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    Google({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET
    }),
    Github({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET
    })
  ],
  debug: false,
  theme: {
    colorScheme: 'dark',
    logo: 'https://silogen.ai/wp-content/uploads/2023/04/202304-Silogen-LogoLogo-Full-White.svg',
    brandColor: '#232341',
  },
  // callbacks: {
  //   async signIn({user, account, profile, email, credentials}) {
  //     const isAllowedToSignIn = true
  //     if (isAllowedToSignIn) {
  //       console.log('signIn', user)
  //       return true
  //     } else {
  //       // Return false to display a default error message
  //       return false
  //       // Or you can return a URL to redirect to:
  //       // return '/unauthorized'
  //     }
  //   },
  //   async redirect({url, baseUrl}) {
  //     return baseUrl
  //   },
  //   async session({session, user, token}) {
  //     console.log('session', session)
  //     const sessionUser = (await clientPromise).db().collection("users").findOne({email: session.user.email})
  //     session.user.id = (await sessionUser)?._id
  //     return session
  //   },
  //   async jwt({token, user, account, profile, isNewUser}) {
  //     return token
  //   }
  // }
})