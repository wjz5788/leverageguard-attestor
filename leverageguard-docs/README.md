# LiqPass Documentation Site (爆仓保帮助中心)

This is the official documentation site for LiqPass (爆仓保), built with Docusaurus and deployed to GitHub Pages.

## Features

- **Bilingual Support**: Chinese (简体中文) as default language, English as secondary
- **Three Core Documents**: Quick Start, Claims & Evidence, FAQ
- **Automatic Deployment**: GitHub Actions workflow for continuous deployment
- **Custom Domain**: Ready for custom domain configuration
- **Modern Design**: Clean, professional documentation site

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run start

# Build for production
npm run build

# Serve production build locally
npm run serve
```

### Repository Setup

1. Create a new GitHub repository named `leverageguard-docs` (public)
2. Initialize git and push to GitHub:

```bash
git init
git add .
git commit -m "docs: bootstrap docusaurus with i18n"
git branch -M main
git remote add origin git@github.com:<your-username>/leverageguard-docs.git
git push -u origin main
```

### GitHub Pages Configuration

1. Go to repository Settings → Pages
2. Set **Build and deployment** to **GitHub Actions**
3. The workflow will automatically deploy on push to main branch

### Custom Domain Setup

1. Update the `CNAME` file in `/static/CNAME` with your actual domain
2. Update `docusaurus.config.ts` with your actual domain:
   - Change `url: 'https://help.yourdomain.com'` to your domain
   - Update `organizationName: '<your-username>'` to your GitHub username
3. Configure DNS CNAME record pointing to `<your-username>.github.io`

## Project Structure

```
leverageguard-docs/
├── docs/                          # Chinese documentation
│   ├── quick-start.md
│   ├── claims-evidence.md
│   └── faq.md
├── i18n/
│   └── en/                       # English translations
│       └── docusaurus-plugin-content-docs/
│           └── current/
├── src/                          # Custom components and styles
├── static/                       # Static assets
│   └── CNAME                     # Custom domain configuration
├── .github/workflows/
│   └── deploy.yml                # GitHub Actions deployment
├── docusaurus.config.ts          # Main configuration
└── sidebars.ts                   # Sidebar configuration
```

## Configuration Notes

- Default language: Chinese (zh-CN)
- Secondary language: English (en)
- Blog disabled (set to `false` in config)
- Three core documents in sidebar: Quick Start, Claims & Evidence, FAQ

## Next Steps

1. **Update domain settings**: Replace `help.yourdomain.com` with your actual domain
2. **Customize styling**: Modify `/src/css/custom.css` to match your brand
3. **Add more content**: Expand documentation as needed
4. **Review and publish**: Push to main branch to trigger deployment

## Support

For issues or questions, please refer to the [Docusaurus documentation](https://docusaurus.io/docs) or create an issue in the repository.
