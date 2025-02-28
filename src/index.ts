import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import { JSDOM } from "jsdom";

import fetch from "node-fetch";

const result = dotenv.config();
// console.log("Token: ", process.env.NOTION_TOKEN)
const child_page_id = "1a7d7b9bf065807f83b5fab5e6f4d0c3"
const parent_page_id ="1a7d7b9bf065808ebc60c7353e24fa3a"
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function main() {


  const response = await notion.pages.retrieve({
    page_id: "1a7d7b9bf065807f83b5fab5e6f4d0c3",

  });
  const url = "https://www.rust-lang.org/learn"
  const baseUrl = new URL(url).origin;
  const page =  await fetch(url);
  if (!page.ok) throw new Error(`Failed to fetch page: ${page.statusText}`);

  const html =  await page.text();

  await addNotionBlocksFromHTML(child_page_id, html,baseUrl)
  console.log("Got response:", response);

}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });




function htmlToNotionBlocks(html: string,url:string) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const blocks: any[] = [];

  function processNode(node: Node) {
    if (node.nodeType === 3 && node.textContent?.trim()) {
      // Text Node
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: node.textContent.trim() } }],
        },
      });
    } else if (node.nodeType === 1) {
      // Element Node
      const tag = (node as HTMLElement).tagName.toLowerCase();
      if (["script", "style", "link", "meta"].includes(tag) || tag.includes("-")) {
        console.log(`Ignoring: <${tag}>`);
        return;
      }

      if (tag === "h1" || tag === "h2" || tag === "h3") {
        blocks.push({
          object: "block",
          type: `heading_${tag === "h1" ? "1" : tag === "h2" ? "2" : "3"}`,
          [`heading_${tag === "h1" ? "1" : tag === "h2" ? "2" : "3"}`]: {
            rich_text: [{ text: { content: node.textContent?.trim() } }],
          },
        });
      } else if (tag === "p") {
        if (node.textContent) {
          blocks.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: node.textContent?.trim() } }],
            },
          });
        }
      } else if (tag === "ul") {
        (node as HTMLElement).querySelectorAll("li").forEach((li) => {
          if (li.textContent) {
            blocks.push({
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: [{ text: { content: li.textContent?.trim() } }],
              },
            });
          }
        });
      } else if (tag === "img") {
        const src = (node as HTMLElement).getAttribute("src");
        console.log("Src: "+src);
        if (src) {
          blocks.push({
            object: "block",
            type: "image",
            image: {
              type: "external",
              external: { url: url+"/"+src },
            },
          });
        }
      }

      // Recursively process child nodes
      node.childNodes.forEach(processNode);
    }
  }

  // Start processing from the body
  document.body.childNodes.forEach(processNode);

  return blocks;
}

//
// 🔹 Function to create a new Notion page from HTML
// async function createNotionPageFromHTML(title:string, html:string) {
//   try {
//     const blocks = htmlToNotionBlocks(html);
//
//     const response = await notion.pages.create({
//       parent: { page_id: parent_page_id },
//       properties: {
//         title: { title: [{ text: { content: title } }] },
//       },
//       children: blocks,
//     });
//
//     console.log("New Notion Page Created:", response);
//   } catch (error) {
//     console.error("Failed to create Notion page:", error);
//   }
// }

// 🔹 Function to add HTML content as blocks to an existing Notion page
async function addNotionBlocksFromHTML(pageId:any, html:string,url:string) {
  try {
    const blocks  = htmlToNotionBlocks(html,url);
  // console.log("Blocks: "+blocks);
    let i=0;
    while(i<blocks.length)
    {await notion.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i,i+100),
    });
    i+=100}

    console.log("Added HTML content to Notion page:", pageId);
  } catch (error) {
    console.error("Failed to add blocks to Notion page:", error);
  }
}