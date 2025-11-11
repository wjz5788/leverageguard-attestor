#!/usr/bin/env node

/**
 * 文档更新自动化脚本
 * 用于检查和自动化文档更新流程
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocsUpdateManager {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.docsDir = path.join(this.projectRoot, 'docs');
    this.readmeFile = path.join(this.projectRoot, 'README.md');
    this.changelogSection = '## 📋 修复清单（Changelog）';
  }

  /**
   * 检查文档链接有效性
   */
  checkLinks() {
    console.log('🔗 检查文档内部链接...');
    
    const markdownFiles = this.findMarkdownFiles(this.docsDir);
    const brokenLinks = [];

    markdownFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const links = this.extractLinks(content);
      
      links.forEach(link => {
        if (link.startsWith('./') || link.startsWith('../')) {
          const resolvedPath = path.resolve(path.dirname(file), link);
          if (!fs.existsSync(resolvedPath)) {
            brokenLinks.push({
              file: path.relative(this.projectRoot, file),
              link: link,
              resolvedPath: path.relative(this.projectRoot, resolvedPath)
            });
          }
        }
      });
    });

    if (brokenLinks.length > 0) {
      console.log('❌ 发现损坏的链接:');
      brokenLinks.forEach(({ file, link, resolvedPath }) => {
        console.log(`   ${file}: ${link} -> ${resolvedPath}`);
      });
      return false;
    } else {
      console.log('✅ 所有链接有效');
      return true;
    }
  }

  /**
   * 检查Markdown格式规范
   */
  lintMarkdown() {
    console.log('📝 检查Markdown格式规范...');
    
    try {
      // 使用markdownlint检查格式
      const result = execSync('npx markdownlint "docs/**/*.md" "README.md"', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      console.log('✅ Markdown格式检查通过');
      return true;
    } catch (error) {
      console.log('❌ Markdown格式检查失败:');
      console.log(error.stdout || error.message);
      return false;
    }
  }

  /**
   * 生成变更日志草稿
   */
  generateChangelogDraft() {
    console.log('📋 生成变更日志草稿...');
    
    try {
      // 获取最近一周的提交记录
      const commits = execSync(
        'git log --since="1 week ago" --pretty=format:"%h|%s|%an|%ad" --date=short',
        { cwd: this.projectRoot, encoding: 'utf8' }
      ).trim().split('\n');

      if (commits.length === 0 || (commits.length === 1 && commits[0] === '')) {
        console.log('ℹ️ 最近一周无新提交');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      let changelogDraft = `### ${today}\n`;

      commits.forEach(commit => {
        if (!commit) return;
        const [hash, message, author, date] = commit.split('|');
        changelogDraft += `- ${message} (${author})\n`;
      });

      console.log('📄 变更日志草稿:');
      console.log(changelogDraft);
      
      return changelogDraft;
    } catch (error) {
      console.log('❌ 生成变更日志失败:', error.message);
      return null;
    }
  }

  /**
   * 检查文档更新状态
   */
  checkDocsUpdateStatus() {
    console.log('🔍 检查文档更新状态...');
    
    const status = {
      readmeUpdated: this.isReadmeUpdated(),
      changelogUpdated: this.isChangelogUpdated(),
      docsUpdated: this.areDocsUpdated()
    };

    console.log('📊 文档更新状态:');
    console.log(`  README更新: ${status.readmeUpdated ? '✅' : '❌'}`);
    console.log(`  变更日志更新: ${status.changelogUpdated ? '✅' : '❌'}`);
    console.log(`  文档目录更新: ${status.docsUpdated ? '✅' : '❌'}`);

    return status;
  }

  /**
   * 查找所有Markdown文件
   */
  findMarkdownFiles(dir) {
    let files = [];
    
    try {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          files = files.concat(this.findMarkdownFiles(fullPath));
        } else if (item.endsWith('.md')) {
          files.push(fullPath);
        }
      });
    } catch (error) {
      // 忽略无法访问的目录
    }
    
    return files;
  }

  /**
   * 从内容中提取链接
   */
  extractLinks(content) {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[2]);
    }
    
    return links;
  }

  /**
   * 检查README是否包含变更日志
   */
  isReadmeUpdated() {
    try {
      const content = fs.readFileSync(this.readmeFile, 'utf8');
      return content.includes(this.changelogSection);
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查变更日志是否有最近更新
   */
  isChangelogUpdated() {
    try {
      const content = fs.readFileSync(this.readmeFile, 'utf8');
      const today = new Date().toISOString().split('T')[0];
      return content.includes(today);
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查文档目录是否有最近修改
   */
  areDocsUpdated() {
    try {
      const result = execSync(
        `git log --since="1 week ago" --name-only --oneline docs/`,
        { cwd: this.projectRoot, encoding: 'utf8' }
      );
      return result.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 运行完整的文档检查
   */
  runFullCheck() {
    console.log('🚀 开始文档完整性检查...\n');
    
    const results = {
      links: this.checkLinks(),
      lint: this.lintMarkdown(),
      status: this.checkDocsUpdateStatus(),
      changelog: this.generateChangelogDraft()
    };

    console.log('\n📋 检查结果汇总:');
    console.log(`🔗 链接检查: ${results.links ? '✅' : '❌'}`);
    console.log(`📝 格式检查: ${results.lint ? '✅' : '❌'}`);
    console.log(`📊 更新状态: ${results.status.readmeUpdated && results.status.changelogUpdated && results.status.docsUpdated ? '✅' : '❌'}`);

    if (!results.links || !results.lint) {
      console.log('\n❌ 文档检查未通过，请修复问题后重新提交');
      process.exit(1);
    } else {
      console.log('\n✅ 文档检查通过');
    }
  }
}

// 命令行接口
const manager = new DocsUpdateManager();

const command = process.argv[2];

switch (command) {
  case 'check-links':
    manager.checkLinks();
    break;
  case 'lint':
    manager.lintMarkdown();
    break;
  case 'changelog':
    manager.generateChangelogDraft();
    break;
  case 'status':
    manager.checkDocsUpdateStatus();
    break;
  case 'full-check':
  default:
    manager.runFullCheck();
    break;
}

export default DocsUpdateManager;