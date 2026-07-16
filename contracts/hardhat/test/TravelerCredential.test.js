const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("TravelerCredential", function () {
  async function deployFixture() {
    const [admin, minter, user1, user2] = await ethers.getSigners();
    const Credential = await ethers.getContractFactory("TravelerCredential");
    const credential = await Credential.deploy(admin.address);
    await credential.waitForDeployment();

    const MINTER_ROLE = await credential.MINTER_ROLE();
    await credential.connect(admin).grantRole(MINTER_ROLE, minter.address);

    return { credential, admin, minter, user1, user2, MINTER_ROLE };
  }

  async function mintedFixture() {
    const base = await deployFixture();
    const tx = await base.credential.connect(base.minter).mintStamp(base.user1.address, "Portugal", "Lisbon");
    await tx.wait();
    return { ...base, tokenId: 1n };
  }

  describe("minting / access control", function () {
    it("reverts for a non-minter caller", async function () {
      const { credential, user1 } = await loadFixture(deployFixture);
      await expect(
        credential.connect(user1).mintStamp(user1.address, "Portugal", "Lisbon")
      ).to.be.revertedWithCustomError(credential, "AccessControlUnauthorizedAccount");
    });

    it("succeeds for a minter, emits StampMinted, assigns sequential tokenId/serial", async function () {
      const { credential, minter, user1, user2 } = await loadFixture(deployFixture);

      await expect(credential.connect(minter).mintStamp(user1.address, "Portugal", "Lisbon"))
        .to.emit(credential, "StampMinted")
        .withArgs(user1.address, 1n, "Portugal", "Lisbon", 1n);

      await expect(credential.connect(minter).mintStamp(user2.address, "Japan", "Tokyo"))
        .to.emit(credential, "StampMinted")
        .withArgs(user2.address, 2n, "Japan", "Tokyo", 2n);

      expect(await credential.ownerOf(1n)).to.equal(user1.address);
      expect(await credential.ownerOf(2n)).to.equal(user2.address);
    });

    it("minting (transfer from address(0)) is not blocked by the soulbound check", async function () {
      const { credential, minter, user1 } = await loadFixture(deployFixture);
      await expect(credential.connect(minter).mintStamp(user1.address, "Portugal", "Lisbon")).to.not.be.reverted;
    });
  });

  describe("soulbound enforcement", function () {
    it("transferFrom reverts SoulboundTokenNoTransfer", async function () {
      const { credential, user1, user2, tokenId } = await loadFixture(mintedFixture);
      await expect(
        credential.connect(user1).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(credential, "SoulboundTokenNoTransfer");
    });

    it("safeTransferFrom (no data) reverts SoulboundTokenNoTransfer", async function () {
      const { credential, user1, user2, tokenId } = await loadFixture(mintedFixture);
      await expect(
        credential.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(credential, "SoulboundTokenNoTransfer");
    });

    it("safeTransferFrom (with data) reverts SoulboundTokenNoTransfer", async function () {
      const { credential, user1, user2, tokenId } = await loadFixture(mintedFixture);
      await expect(
        credential
          .connect(user1)
          ["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, tokenId, "0x")
      ).to.be.revertedWithCustomError(credential, "SoulboundTokenNoTransfer");
    });

    it("approve reverts SoulboundTokenNoTransfer regardless of caller", async function () {
      const { credential, user1, user2, tokenId } = await loadFixture(mintedFixture);
      await expect(credential.connect(user1).approve(user2.address, tokenId)).to.be.revertedWithCustomError(
        credential,
        "SoulboundTokenNoTransfer"
      );
    });

    it("setApprovalForAll reverts SoulboundTokenNoTransfer for both true and false", async function () {
      const { credential, user1, user2 } = await loadFixture(mintedFixture);
      await expect(credential.connect(user1).setApprovalForAll(user2.address, true)).to.be.revertedWithCustomError(
        credential,
        "SoulboundTokenNoTransfer"
      );
      await expect(credential.connect(user1).setApprovalForAll(user2.address, false)).to.be.revertedWithCustomError(
        credential,
        "SoulboundTokenNoTransfer"
      );
    });
  });

  describe("metadata reads", function () {
    it("tokenURI/getStamp revert for a nonexistent tokenId", async function () {
      const { credential } = await loadFixture(deployFixture);
      await expect(credential.tokenURI(999n)).to.be.revertedWithCustomError(credential, "ERC721NonexistentToken");
      await expect(credential.getStamp(999n)).to.be.revertedWithCustomError(credential, "ERC721NonexistentToken");
    });

    it("getStamp returns correct data for a minted token", async function () {
      const { credential, tokenId } = await loadFixture(mintedFixture);
      const [country, city, serial] = await credential.getStamp(tokenId);
      expect(country).to.equal("Portugal");
      expect(city).to.equal("Lisbon");
      expect(serial).to.equal(tokenId);
    });

    it("tokenURI returns a decodable base64 JSON data URI for a minted token", async function () {
      const { credential, tokenId } = await loadFixture(mintedFixture);
      const uri = await credential.tokenURI(tokenId);
      expect(uri).to.match(/^data:application\/json;base64,/);
      const json = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
      const meta = JSON.parse(json);
      expect(meta.name).to.equal("NATIVE Stamp #1");
      expect(meta.attributes).to.deep.include({ trait_type: "City", value: "Lisbon" });
    });
  });

  describe("supportsInterface", function () {
    it("returns true for ERC721 and AccessControl interface IDs", async function () {
      const { credential } = await loadFixture(deployFixture);
      expect(await credential.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
      expect(await credential.supportsInterface("0x7965db0b")).to.equal(true); // AccessControl
      expect(await credential.supportsInterface("0xffffffff")).to.equal(false);
    });
  });
});
